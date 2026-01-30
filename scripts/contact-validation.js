document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("#contact-form");
  if (!form) {
    return;
  }

  const getCookie = (name) => {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : "";
  };

  const getLang = () => {
    const switchToEn = document.getElementById("switch-to-en");
    if (switchToEn && switchToEn.style.display === "none") {
      return "en";
    }
    const stored = (localStorage.getItem("language") || getCookie("language") || "").toLowerCase();
    const docLang = (document.documentElement.lang || "").toLowerCase();
    return stored || docLang || "fr";
  };

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
    event.target.setCustomValidity("");
  };

  const inputs = form.querySelectorAll("input, textarea, select");
  inputs.forEach((input) => {
    input.addEventListener("invalid", handleInvalid);
    input.addEventListener("input", clearValidity);
    input.addEventListener("change", clearValidity);
    input.addEventListener("blur", clearValidity);
  });

  const applyCustomMessages = () => {
    inputs.forEach((input) => {
      const message = getMessage(input);
      if (message) {
        input.setCustomValidity(message);
      } else {
        input.setCustomValidity("");
      }
    });
  };

  form.addEventListener(
    "submit",
    (event) => {
      applyCustomMessages();
      if (!form.checkValidity()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        form.reportValidity();
      }
    },
    true
  );

  document.addEventListener("translationCompleted", () => {
    inputs.forEach((input) => {
      input.setCustomValidity("");
    });
  });
});
