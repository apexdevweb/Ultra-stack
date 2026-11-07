document.addEventListener("DOMContentLoaded", () => {
  const LOGGING_FORM = document.getElementById("login-form");
  const USER_MAIL = document.getElementById("user-mail");
  const USER_PASS = document.getElementById("user-pass");
  const LOGIN_STATUS = document.getElementById("info-connexion");

  const MAIL_VALID = "ultrastack@gmail.com";
  const PASS_VALID = "Ultra2026";

  LOGGING_FORM.addEventListener("submit", (event) => {
    event.preventDefault();

    const MAIL_VALUE = USER_MAIL.value;
    const PASS_VALUE = USER_PASS.value;

    if (MAIL_VALUE === MAIL_VALID && PASS_VALUE === PASS_VALID) {

      sessionStorage.setItem("userEmail", MAIL_VALUE);
      sessionStorage.setItem("userPass", PASS_VALUE);
      sessionStorage.setItem("isLoggedIn", true);

      LOGIN_STATUS.textContent = "Bienvenue" + " " + MAIL_VALUE;

      LOGGING_FORM.reset();
    } else {
      LOGIN_STATUS.textContent = "Identifiant introuvable";
    }
  });
});
