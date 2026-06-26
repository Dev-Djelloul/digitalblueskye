// Completion Guard — cote serveur, applique APRES qu'un modele a repondu et
// AVANT l'envoi au frontend. Deux roles :
//   1. Continuation automatique quand la reponse a ete tronquee par la limite
//      de tokens (finish_reason === 'length'), avec fusion intelligente des
//      morceaux (sans duplication a la jointure), bornee a N continuations.
//   2. Fermeture des structures Markdown laissees ouvertes par une troncature
//      (code fences, tableaux, listes, citations, titres), pour ne jamais
//      envoyer au frontend un Markdown structurellement casse.
//
// Pur et decouple : l'orchestrateur applyCompletionGuard() recoit une closure
// requestContinuation(accumulatedContent) -> { ok, content, finishReason },
// fournie par modelRouter.js (qui sait appeler le bon modele). Les fonctions
// isTruncated / mergeContinuation / closeOpenMarkdownStructures sont
// entierement testables sans reseau (cf. completionGuard.test.mjs).

export const DEFAULT_MAX_CONTINUATIONS = 2;
export const HARD_MAX_CONTINUATIONS = 3;
// On ne tente une continuation que si le morceau tronque est deja substantiel :
// une troncature a quelques caracteres traduit en general un probleme amont
// (modele degenere), pas une vraie reponse longue coupee.
export const MIN_CONTENT_FOR_CONTINUATION = 200;

export const GUARD_EVENT_TYPES = {
  TRUNCATED: 'completion_truncated',
  CONTINUED: 'completion_continued',
  CONTINUATION_FAILED: 'completion_continuation_failed',
  STRUCTURE_CLOSED: 'completion_structure_closed'
};

export function isTruncated(finishReason) {
  const reason = String(finishReason || '').toLowerCase();
  return reason === 'length' || reason === 'max_tokens' || reason === 'max_output_tokens';
}

export function resolveMaxContinuations(envValue) {
  const parsed = Number(envValue);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_CONTINUATIONS;
  return Math.max(0, Math.min(HARD_MAX_CONTINUATIONS, Math.floor(parsed)));
}

/**
 * Fusion intelligente de deux morceaux successifs. Un modele qui "continue"
 * re-emet souvent les derniers caracteres deja produits : on detecte le plus
 * grand suffixe de `prev` qui est aussi prefixe de `next` et on le retire de
 * `next` pour eviter la duplication a la jointure. Si aucun chevauchement,
 * on concatene directement (le modele reprend mot-pour-mot la ou il s'est
 * arrete, y compris en plein milieu d'un mot).
 */
export function mergeContinuation(prev, next) {
  const p = String(prev || '');
  const n = String(next || '');
  if (!p) return n;
  if (!n) return p;
  const maxOverlap = Math.min(300, p.length, n.length);
  for (let k = maxOverlap; k > 0; k -= 1) {
    if (p.slice(p.length - k) === n.slice(0, k)) {
      return p + n.slice(k);
    }
  }
  return p + n;
}

/**
 * Ferme/nettoie les structures Markdown laissees ouvertes par une troncature.
 * Conservateur : ne touche jamais au contenu d'un bloc de code, ne fait que
 * retirer un fragment de fin manifestement incomplet ou rajouter une
 * fermeture manquante. Retourne { text, meta } ou meta detaille ce qui a ete
 * corrige (pour la telemetrie).
 */
export function closeOpenMarkdownStructures(text) {
  const meta = {
    closed_code_fence: false,
    dropped_empty_heading: false,
    dropped_empty_list_marker: false,
    dropped_partial_table_row: false,
    dropped_dangling_citation: false,
    balanced_inline_code: false
  };
  let out = String(text || '').replace(/[ \t]+\n/g, '\n').replace(/\s+$/, '');
  if (!out) return { text: out, meta };

  let lines = out.split('\n');
  const fenceCount = lines.filter((line) => /^\s*```/.test(line)).length;
  const insideCodeBlock = fenceCount % 2 === 1;

  if (!insideCodeBlock) {
    // Nettoyage de la DERNIERE ligne uniquement quand on n'est pas a
    // l'interieur d'un bloc de code (sinon on toucherait du code legitime).
    const lastTrim = (lines[lines.length - 1] || '').trim();
    if (/^#{1,6}\s*$/.test(lastTrim)) {
      lines.pop();
      meta.dropped_empty_heading = true;
    } else if (/^([-*+]|\d+[.)])\s*$/.test(lastTrim)) {
      lines.pop();
      meta.dropped_empty_list_marker = true;
    } else if (/^\|/.test(lastTrim) && !/\|\s*$/.test(lastTrim)) {
      // Ligne de tableau coupee en plein milieu (commence par | mais ne se
      // termine pas par |) : on retire cette ligne incomplete.
      lines.pop();
      meta.dropped_partial_table_row = true;
    }
    out = lines.join('\n').replace(/\s+$/, '');

    // Citation ouverte en toute fin ([S12, [3, [ ... sans ] de fermeture).
    const danglingCitation = out.match(/\[S?\d{0,3}\s*$/);
    if (danglingCitation && !/\]\s*$/.test(out)) {
      out = out.slice(0, out.length - danglingCitation[0].length).replace(/\s+$/, '');
      meta.dropped_dangling_citation = true;
    }

    // Code inline non ferme (nombre impair de backticks simples hors fences).
    const withoutFences = out.replace(/```[\s\S]*?```/g, '');
    const inlineTicks = (withoutFences.match(/`/g) || []).length;
    if (inlineTicks % 2 === 1) {
      out += '`';
      meta.balanced_inline_code = true;
    }
  } else {
    // On est a l'interieur d'un bloc de code ouvert : on le ferme proprement.
    out += '\n```';
    meta.closed_code_fence = true;
  }

  return { text: out, meta };
}

function anyStructureClosed(meta) {
  return Boolean(
    meta.closed_code_fence ||
    meta.dropped_empty_heading ||
    meta.dropped_empty_list_marker ||
    meta.dropped_partial_table_row ||
    meta.dropped_dangling_citation ||
    meta.balanced_inline_code
  );
}

/**
 * Orchestrateur. Boucle de continuation tant que la reponse est tronquee et
 * que le budget de continuations n'est pas epuise, puis fermeture finale.
 * Ne leve jamais : en cas d'echec d'une continuation, on s'arrete et on
 * ferme proprement ce qu'on a deja.
 *
 * requestContinuation(accumulatedContent) doit retourner
 *   { ok: boolean, content: string, finishReason: string }
 */
export async function applyCompletionGuard({
  initialContent,
  initialFinishReason,
  requestContinuation,
  maxContinuations = DEFAULT_MAX_CONTINUATIONS,
  minContentForContinuation = MIN_CONTENT_FOR_CONTINUATION,
  onEvent
}) {
  const emit = (type, payload) => {
    if (typeof onEvent === 'function') {
      try { onEvent(type, payload); } catch (error) { /* telemetrie non bloquante */ }
    }
  };

  let content = String(initialContent || '');
  let finishReason = initialFinishReason;
  let continuations = 0;
  const budget = Math.max(0, Math.min(HARD_MAX_CONTINUATIONS, Number(maxContinuations) || 0));

  const canContinue = typeof requestContinuation === 'function'
    && budget > 0
    && content.length >= minContentForContinuation;

  if (isTruncated(finishReason) && canContinue) {
    emit(GUARD_EVENT_TYPES.TRUNCATED, { initial_length: content.length, finish_reason: finishReason });
    while (isTruncated(finishReason) && continuations < budget) {
      let step;
      try {
        step = await requestContinuation(content);
      } catch (error) {
        emit(GUARD_EVENT_TYPES.CONTINUATION_FAILED, { attempt: continuations + 1, error: error instanceof Error ? error.message : String(error) });
        break;
      }
      if (!step || !step.ok || !step.content) {
        emit(GUARD_EVENT_TYPES.CONTINUATION_FAILED, { attempt: continuations + 1, reason: step?.reason || 'empty_or_failed' });
        break;
      }
      const before = content.length;
      content = mergeContinuation(content, step.content);
      continuations += 1;
      finishReason = step.finishReason;
      emit(GUARD_EVENT_TYPES.CONTINUED, {
        attempt: continuations,
        added_chars: content.length - before,
        total_length: content.length,
        finish_reason: finishReason
      });
    }
  }

  const closed = closeOpenMarkdownStructures(content);
  if (anyStructureClosed(closed.meta)) {
    emit(GUARD_EVENT_TYPES.STRUCTURE_CLOSED, closed.meta);
  }

  return {
    content: closed.text,
    continuations,
    finishReason,
    wasTruncated: isTruncated(initialFinishReason),
    stillTruncated: isTruncated(finishReason),
    structureMeta: closed.meta
  };
}
