document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector(".contact-form");
  if (!form) {
    return;
  }

  const getLang = () => (document.documentElement.lang || "fr").toLowerCase();

  const messages = {
    fr: {
      valueMissing: "Veuillez renseigner ce champ.",
      typeMismatchEmail: "Veuillez saisir une adresse email valide.",
      checkboxMissing: "Veuillez cocher cette case pour continuer.",
    },
    en: {
      valueMissing: "Please fill out this field.",
      typeMismatchEmail: "Please enter a valid email address.",
      checkboxMissing: "Please check this box to continue.",
    },
  };

  const getMessage = (input) => {
    const lang = getLang().startsWith("en") ? "en" : "fr";
    const copy = messages[lang];

    if (input.validity.typeMismatch && input.type === "email") {
      return copy.typeMismatchEmail;
    }

    if (input.validity.valueMissing) {
      if (input.type === "checkbox") {
        return copy.checkboxMissing;
      }
      return copy.valueMissing;
    }

    return "";
  };

  const handleInvalid = (event) => {
    const input = event.target;
    const message = getMessage(input);
    if (message) {
      input.setCustomValidity(message);
    }
  };

  const clearValidity = (event) => {
    const input = event.target;
    if (input.type === "email" && input.validity.typeMismatch) {
      input.setCustomValidity(getMessage(input));
      return;
    }
    input.setCustomValidity("");
  };

  const inputs = form.querySelectorAll("input, textarea, select");
  inputs.forEach((input) => {
    input.addEventListener("invalid", handleInvalid);
    input.addEventListener("input", clearValidity);
    input.addEventListener("change", clearValidity);
  });
});
