// UI-chrome strings for the casino-v1 template that the docx can never
// supply (navbar/footer labels that don't correspond to any docx page,
// login/registration form field labels). Same maintenance pattern as
// casinoParser.py's per-language keyword lists: add a locale here as new
// sites need it. Falls back to English for any locale/key not yet covered
// rather than failing the build.

export type CasinoV1Dictionary = {
  nav: {
    login: string;
    registration: string;
    signUp: string;
    application: string;
    withdrawal: string;
    review: string;
    bonus: string;
    noDepositBonus: string;
    freeSpins: string;
    promoCodes: string;
    slots: string;
  };
  footer: {
    responsibleGaming: string;
    privacyPolicy: string;
    cookiesPolicy: string;
    bettingRules: string;
    termsConditions: string;
    contacts: string;
  };
  forms: {
    login: {
      title: string;
      subtitle: string;
      emailOrUsername: string;
      password: string;
      rememberMe: string;
      loginButton: string;
      forgotPassword: string;
      closeLabel: string;
    };
    registration: {
      title: string;
      subtitle: string;
      username: string;
      email: string;
      password: string;
      confirmPassword: string;
      country: string;
      signUpButton: string;
      closeLabel: string;
    };
  };
  intro: {
    ctaText: string;
  };
  // A generic, always-eligible promo banner casino-v1-rules.ts injects
  // between page sections (casino-v2 only, for now) — not the docx/content-
  // library-supplied intro banner, which has its own bannerText/paragraphs.
  promoBanner: {
    heading: string;
    overlayText: string;
  };
  stickyBanner: {
    headline: string;
    disclaimer: string;
    bullets: string[];
  };
  // AgeGate popup copy (both templates). {casinoName} and {age} are
  // literal placeholders substituted by casino-v1-rules.ts, not real
  // interpolation - keeping them as plain string templates here (rather
  // than functions) matches every other entry in this dictionary.
  ageGate: {
    title: string;
    body: string;
    confirmText: string;
    declineText: string;
    footnote: string;
  };
};

const en: CasinoV1Dictionary = {
  nav: {
    login: "Login",
    registration: "Registration",
    signUp: "Create Account",
    application: "Application",
    withdrawal: "Withdrawal",
    review: "Review",
    bonus: "Bonus",
    noDepositBonus: "No Deposit Bonus",
    freeSpins: "Free Spins",
    promoCodes: "Promo Codes",
    slots: "Slots",
  },
  footer: {
    responsibleGaming: "Responsible Gaming",
    privacyPolicy: "Privacy Policy",
    cookiesPolicy: "Cookies Policy",
    bettingRules: "Betting Rules",
    termsConditions: "Terms & Conditions",
    contacts: "Contacts",
  },
  forms: {
    login: {
      title: "Login",
      subtitle: "Access your account.",
      emailOrUsername: "Email / Username",
      password: "Password",
      rememberMe: "Remember Me",
      loginButton: "Login",
      forgotPassword: "Forgot Password",
      closeLabel: "Close login form",
    },
    registration: {
      title: "Create Account",
      subtitle: "Start your registration with your basic details.",
      username: "Username",
      email: "Email",
      password: "Password",
      confirmPassword: "Confirm Password",
      country: "Country",
      signUpButton: "Sign Up",
      closeLabel: "Close registration form",
    },
  },
  intro: {
    ctaText: "Claim Bonus",
  },
  promoBanner: {
    heading: "Ready to Get Started?",
    overlayText: "Your Welcome Bonus Is Waiting",
  },
  stickyBanner: {
    headline: "Welcome Bonus",
    disclaimer: "T&Cs apply. {age}+",
    bullets: ["Fast Payouts", "24/7 Support", "Secure & Licensed"],
  },
  ageGate: {
    title: "Age Verification",
    body: "{casinoName} is intended for adults only. You must be at least {age} years old to enter.",
    confirmText: "Yes, I'm {age}+",
    declineText: "No, exit",
    footnote: "By entering, you confirm you meet the minimum legal gambling age in your jurisdiction.",
  },
};

const el: CasinoV1Dictionary = {
  nav: {
    login: "Σύνδεση",
    registration: "Εγγραφή",
    signUp: "Δημιουργία Λογαριασμού",
    application: "Εφαρμογή",
    withdrawal: "Ανάληψη",
    review: "Αξιολόγηση",
    bonus: "Μπόνους",
    noDepositBonus: "Μπόνους χωρίς κατάθεση",
    freeSpins: "Δωρεάν περιστροφές",
    promoCodes: "Κωδικοί προσφοράς",
    slots: "Slots",
  },
  footer: {
    responsibleGaming: "Υπεύθυνο Παιχνίδι",
    privacyPolicy: "Πολιτική Απορρήτου",
    cookiesPolicy: "Πολιτική Cookies",
    bettingRules: "Κανόνες Στοιχηματισμού",
    termsConditions: "Όροι & Προϋποθέσεις",
    contacts: "Επικοινωνία",
  },
  forms: {
    login: {
      title: "Σύνδεση",
      subtitle: "Αποκτήστε πρόσβαση στον λογαριασμό σας.",
      emailOrUsername: "Email / Όνομα Χρήστη",
      password: "Κωδικός Πρόσβασης",
      rememberMe: "Να με θυμάσαι",
      loginButton: "Σύνδεση",
      forgotPassword: "Ξέχασα τον Κωδικό Πρόσβασης",
      closeLabel: "Κλείσιμο φόρμας σύνδεσης",
    },
    registration: {
      title: "Δημιουργία Λογαριασμού",
      subtitle: "Ξεκινήστε την εγγραφή με τα βασικά σας στοιχεία.",
      username: "Όνομα Χρήστη",
      email: "Email",
      password: "Κωδικός Πρόσβασης",
      confirmPassword: "Επιβεβαίωση Κωδικού",
      country: "Χώρα",
      signUpButton: "Εγγραφή",
      closeLabel: "Κλείσιμο φόρμας εγγραφής",
    },
  },
  intro: {
    ctaText: "Λάβε το Μπόνους",
  },
  promoBanner: {
    heading: "Έτοιμοι να ξεκινήσετε;",
    overlayText: "Το μπόνους καλωσορίσματός σας σας περιμένει",
  },
  stickyBanner: {
    headline: "Μπόνους Καλωσορίσματος",
    disclaimer: "Ισχύουν Ό.Π. {age}+",
    bullets: ["Γρήγορες Πληρωμές", "Υποστήριξη 24/7", "Ασφαλές & Αδειοδοτημένο"],
  },
  ageGate: {
    title: "Επιβεβαίωση Ηλικίας",
    body: "Το {casinoName} απευθύνεται αποκλειστικά σε ενήλικες. Πρέπει να είστε τουλάχιστον {age} ετών για να εισέλθετε.",
    confirmText: "Ναι, είμαι {age}+",
    declineText: "Όχι, έξοδος",
    footnote: "Εισερχόμενοι, επιβεβαιώνετε ότι πληροίτε την ελάχιστη νόμιμη ηλικία τυχερών παιχνιδιών στη δικαιοδοσία σας.",
  },
};

const de: CasinoV1Dictionary = {
  nav: {
    login: "Anmeldung",
    registration: "Registrierung",
    signUp: "Konto erstellen",
    application: "Startseite",
    withdrawal: "Auszahlung",
    review: "Bewertung",
    bonus: "Bonus",
    noDepositBonus: "Bonus ohne Einzahlung",
    freeSpins: "Freispiele",
    promoCodes: "Aktionscodes",
    slots: "Slots",
  },
  footer: {
    responsibleGaming: "Verantwortungsvolles Spielen",
    privacyPolicy: "Datenschutzerklärung",
    cookiesPolicy: "Cookie-Richtlinie",
    bettingRules: "Spielregeln",
    termsConditions: "Allgemeine Geschäftsbedingungen",
    contacts: "Kontakt",
  },
  forms: {
    login: {
      title: "Anmeldung",
      subtitle: "Greifen Sie auf Ihr Konto zu.",
      emailOrUsername: "E-Mail / Benutzername",
      password: "Passwort",
      rememberMe: "Angemeldet bleiben",
      loginButton: "Anmelden",
      forgotPassword: "Passwort vergessen",
      closeLabel: "Anmeldeformular schließen",
    },
    registration: {
      title: "Konto erstellen",
      subtitle: "Beginnen Sie die Registrierung mit Ihren Basisdaten.",
      username: "Benutzername",
      email: "E-Mail",
      password: "Passwort",
      confirmPassword: "Passwort bestätigen",
      country: "Land",
      signUpButton: "Registrieren",
      closeLabel: "Registrierungsformular schließen",
    },
  },
  intro: {
    ctaText: "Bonus sichern",
  },
  promoBanner: {
    heading: "Bereit loszulegen?",
    overlayText: "Ihr Willkommensbonus wartet auf Sie",
  },
  stickyBanner: {
    headline: "Willkommensbonus",
    disclaimer: "AGB gelten. {age}+",
    bullets: ["Schnelle Auszahlungen", "24/7 Support", "Sicher & Lizenziert"],
  },
  ageGate: {
    title: "Altersverifikation",
    body: "{casinoName} richtet sich ausschließlich an Erwachsene. Sie müssen mindestens {age} Jahre alt sein, um fortzufahren.",
    confirmText: "Ja, ich bin {age}+",
    declineText: "Nein, verlassen",
    footnote: "Mit dem Betreten bestätigen Sie, dass Sie das gesetzliche Mindestalter für Glücksspiele in Ihrer Rechtsprechung erfüllen.",
  },
};

const no: CasinoV1Dictionary = {
  nav: {
    login: "Logg inn",
    registration: "Registrering",
    signUp: "Opprett konto",
    application: "Forside",
    withdrawal: "Uttak",
    review: "Anmeldelse",
    bonus: "Bonus",
    noDepositBonus: "Bonus uten innskudd",
    freeSpins: "Free Spins",
    promoCodes: "Kampanjekoder",
    slots: "Spilleautomater",
  },
  footer: {
    responsibleGaming: "Ansvarlig Spilling",
    privacyPolicy: "Personvernerklæring",
    cookiesPolicy: "Retningslinjer for Informasjonskapsler",
    bettingRules: "Spilleregler",
    termsConditions: "Vilkår og Betingelser",
    contacts: "Kontakt",
  },
  forms: {
    login: {
      title: "Logg inn",
      subtitle: "Få tilgang til kontoen din.",
      emailOrUsername: "E-post / Brukernavn",
      password: "Passord",
      rememberMe: "Husk meg",
      loginButton: "Logg inn",
      forgotPassword: "Glemt passord",
      closeLabel: "Lukk innloggingsskjema",
    },
    registration: {
      title: "Opprett Konto",
      subtitle: "Start registreringen med dine grunnleggende opplysninger.",
      username: "Brukernavn",
      email: "E-post",
      password: "Passord",
      confirmPassword: "Bekreft Passord",
      country: "Land",
      signUpButton: "Registrer deg",
      closeLabel: "Lukk registreringsskjema",
    },
  },
  intro: {
    ctaText: "Hent Bonus",
  },
  promoBanner: {
    heading: "Klar til å komme i gang?",
    overlayText: "Velkomstbonusen din venter",
  },
  stickyBanner: {
    headline: "Velkomstbonus",
    disclaimer: "Vilkår gjelder. {age}+",
    bullets: ["Raske utbetalinger", "Support 24/7", "Trygt og lisensiert"],
  },
  ageGate: {
    title: "Aldersverifisering",
    body: "{casinoName} er kun beregnet på voksne. Du må være minst {age} år for å få tilgang.",
    confirmText: "Ja, jeg er {age}+",
    declineText: "Nei, avslutt",
    footnote: "Ved å gå inn bekrefter du at du oppfyller minstealderen for pengespill i din jurisdiksjon.",
  },
};

// Netherlands: legal gambling age is 24+, not the usual 18+ (see
// MINIMUM_AGE_BY_LOCALE in casino-v1-rules.ts) - baked directly into this
// disclaimer string, same as every other locale's sentence bakes in its own
// age suffix, rather than templated separately.
const nl: CasinoV1Dictionary = {
  nav: {
    login: "Inloggen",
    registration: "Registratie",
    signUp: "Account aanmaken",
    application: "Home",
    withdrawal: "Uitbetaling",
    review: "Beoordeling",
    bonus: "Bonus",
    noDepositBonus: "Bonus zonder storting",
    freeSpins: "Gratis Spins",
    promoCodes: "Promotiecodes",
    slots: "Slots",
  },
  footer: {
    responsibleGaming: "Verantwoord Spelen",
    privacyPolicy: "Privacybeleid",
    cookiesPolicy: "Cookiebeleid",
    bettingRules: "Spelregels",
    termsConditions: "Algemene Voorwaarden",
    contacts: "Contact",
  },
  forms: {
    login: {
      title: "Inloggen",
      subtitle: "Krijg toegang tot uw account.",
      emailOrUsername: "E-mail / Gebruikersnaam",
      password: "Wachtwoord",
      rememberMe: "Onthoud mij",
      loginButton: "Inloggen",
      forgotPassword: "Wachtwoord vergeten",
      closeLabel: "Inlogformulier sluiten",
    },
    registration: {
      title: "Account aanmaken",
      subtitle: "Start uw registratie met uw basisgegevens.",
      username: "Gebruikersnaam",
      email: "E-mail",
      password: "Wachtwoord",
      confirmPassword: "Bevestig wachtwoord",
      country: "Land",
      signUpButton: "Registreren",
      closeLabel: "Registratieformulier sluiten",
    },
  },
  intro: {
    ctaText: "Bonus claimen",
  },
  promoBanner: {
    heading: "Klaar om te beginnen?",
    overlayText: "Je welkomstbonus wacht op je",
  },
  stickyBanner: {
    headline: "Welkomstbonus",
    disclaimer: "Algemene voorwaarden van toepassing. {age}+",
    bullets: ["Snelle uitbetalingen", "24/7 Support", "Veilig & Gelicentieerd"],
  },
  ageGate: {
    title: "Leeftijdsverificatie",
    body: "{casinoName} is uitsluitend bedoeld voor volwassenen. U moet minimaal {age} jaar oud zijn om toegang te krijgen.",
    confirmText: "Ja, ik ben {age}+",
    declineText: "Nee, verlaten",
    footnote: "Door binnen te gaan, bevestigt u dat u voldoet aan de minimumleeftijd voor kansspelen in uw rechtsgebied.",
  },
};

const sv: CasinoV1Dictionary = {
  nav: {
    login: "Logga in",
    registration: "Registrering",
    signUp: "Skapa konto",
    application: "Hem",
    withdrawal: "Uttag",
    review: "Recension",
    bonus: "Bonus",
    noDepositBonus: "Bonus utan insättning",
    freeSpins: "Free Spins",
    promoCodes: "Kampanjkoder",
    slots: "Spelautomater",
  },
  footer: {
    responsibleGaming: "Ansvarsfullt spelande",
    privacyPolicy: "Integritetspolicy",
    cookiesPolicy: "Cookiepolicy",
    bettingRules: "Spelregler",
    termsConditions: "Villkor",
    contacts: "Kontakt",
  },
  forms: {
    login: {
      title: "Logga in",
      subtitle: "Få tillgång till ditt konto.",
      emailOrUsername: "E-post / Användarnamn",
      password: "Lösenord",
      rememberMe: "Kom ihåg mig",
      loginButton: "Logga in",
      forgotPassword: "Glömt lösenord",
      closeLabel: "Stäng inloggningsformulär",
    },
    registration: {
      title: "Skapa konto",
      subtitle: "Börja din registrering med dina grunduppgifter.",
      username: "Användarnamn",
      email: "E-post",
      password: "Lösenord",
      confirmPassword: "Bekräfta lösenord",
      country: "Land",
      signUpButton: "Registrera dig",
      closeLabel: "Stäng registreringsformulär",
    },
  },
  intro: {
    ctaText: "Hämta bonus",
  },
  promoBanner: {
    heading: "Redo att börja?",
    overlayText: "Din välkomstbonus väntar",
  },
  stickyBanner: {
    headline: "Välkomstbonus",
    disclaimer: "Villkor gäller. {age}+",
    bullets: ["Snabba utbetalningar", "Support dygnet runt", "Säkert & Licensierat"],
  },
  ageGate: {
    title: "Åldersverifiering",
    body: "{casinoName} är endast avsett för vuxna. Du måste vara minst {age} år för att gå vidare.",
    confirmText: "Ja, jag är {age}+",
    declineText: "Nej, avsluta",
    footnote: "Genom att gå vidare bekräftar du att du uppfyller den lägsta lagliga åldern för spel i din jurisdiktion.",
  },
};

const fi: CasinoV1Dictionary = {
  nav: {
    login: "Kirjaudu sisään",
    registration: "Rekisteröityminen",
    signUp: "Luo tili",
    application: "Etusivu",
    withdrawal: "Kotiutus",
    review: "Arvostelu",
    bonus: "Bonus",
    noDepositBonus: "Talletukseton bonus",
    freeSpins: "Ilmaiskierrokset",
    promoCodes: "Kampanjakoodit",
    slots: "Kolikkopelit",
  },
  footer: {
    responsibleGaming: "Vastuullinen pelaaminen",
    privacyPolicy: "Tietosuojakäytäntö",
    cookiesPolicy: "Evästekäytäntö",
    bettingRules: "Pelisäännöt",
    termsConditions: "Käyttöehdot",
    contacts: "Yhteystiedot",
  },
  forms: {
    login: {
      title: "Kirjaudu sisään",
      subtitle: "Käytä tiliäsi.",
      emailOrUsername: "Sähköposti / Käyttäjätunnus",
      password: "Salasana",
      rememberMe: "Muista minut",
      loginButton: "Kirjaudu sisään",
      forgotPassword: "Unohtuiko salasana",
      closeLabel: "Sulje kirjautumislomake",
    },
    registration: {
      title: "Luo tili",
      subtitle: "Aloita rekisteröityminen perustiedoillasi.",
      username: "Käyttäjätunnus",
      email: "Sähköposti",
      password: "Salasana",
      confirmPassword: "Vahvista salasana",
      country: "Maa",
      signUpButton: "Rekisteröidy",
      closeLabel: "Sulje rekisteröitymislomake",
    },
  },
  intro: {
    ctaText: "Lunasta bonus",
  },
  promoBanner: {
    heading: "Valmis aloittamaan?",
    overlayText: "Tervetuliaisbonuksesi odottaa",
  },
  stickyBanner: {
    headline: "Tervetuliaisbonus",
    disclaimer: "Ehdot voimassa. {age}+",
    bullets: ["Nopeat kotiutukset", "Tuki 24/7", "Turvallinen & Lisensoitu"],
  },
  ageGate: {
    title: "Ikävahvistus",
    body: "{casinoName} on tarkoitettu vain aikuisille. Sinun on oltava vähintään {age}-vuotias päästäksesi sisään.",
    confirmText: "Kyllä, olen {age}+",
    declineText: "Ei, poistu",
    footnote: "Jatkamalla vahvistat täyttäväsi oman lainkäyttöalueesi rahapelien vähimmäisikävaatimuksen.",
  },
};

const et: CasinoV1Dictionary = {
  nav: {
    login: "Logi sisse",
    registration: "Registreerimine",
    signUp: "Loo konto",
    application: "Avaleht",
    withdrawal: "Väljamakse",
    review: "Ülevaade",
    bonus: "Boonus",
    noDepositBonus: "Sissemakseta boonus",
    freeSpins: "Tasuta spinnid",
    promoCodes: "Sooduskoodid",
    slots: "Mänguautomaadid",
  },
  footer: {
    responsibleGaming: "Vastutustundlik mängimine",
    privacyPolicy: "Privaatsuspoliitika",
    cookiesPolicy: "Küpsiste poliitika",
    bettingRules: "Mängureeglid",
    termsConditions: "Kasutustingimused",
    contacts: "Kontakt",
  },
  forms: {
    login: {
      title: "Logi sisse",
      subtitle: "Ligipääs oma kontole.",
      emailOrUsername: "E-post / Kasutajanimi",
      password: "Parool",
      rememberMe: "Jäta mind meelde",
      loginButton: "Logi sisse",
      forgotPassword: "Unustasid parooli",
      closeLabel: "Sulge sisselogimisvorm",
    },
    registration: {
      title: "Loo konto",
      subtitle: "Alusta registreerimist oma põhiandmetega.",
      username: "Kasutajanimi",
      email: "E-post",
      password: "Parool",
      confirmPassword: "Kinnita parool",
      country: "Riik",
      signUpButton: "Registreeru",
      closeLabel: "Sulge registreerimisvorm",
    },
  },
  intro: {
    ctaText: "Lunasta boonus",
  },
  promoBanner: {
    heading: "Valmis alustama?",
    overlayText: "Sinu tervitusboonus ootab",
  },
  stickyBanner: {
    headline: "Tervitusboonus",
    disclaimer: "Kehtivad tingimused. {age}+",
    bullets: ["Kiired väljamaksed", "Tugi 24/7", "Turvaline ja litsentseeritud"],
  },
  ageGate: {
    title: "Vanuse kinnitamine",
    body: "{casinoName} on mõeldud ainult täiskasvanutele. Sisenemiseks pead olema vähemalt {age}-aastane.",
    confirmText: "Jah, olen {age}+",
    declineText: "Ei, lahku",
    footnote: "Jätkates kinnitad, et vastad oma jurisdiktsiooni hasartmängude miinimumvanuse nõudele.",
  },
};

const hu: CasinoV1Dictionary = {
  nav: {
    login: "Bejelentkezés",
    registration: "Regisztráció",
    signUp: "Fiók létrehozása",
    application: "Kezdőlap",
    withdrawal: "Kifizetés",
    review: "Értékelés",
    bonus: "Bónusz",
    noDepositBonus: "Befizetés nélküli bónusz",
    freeSpins: "Ingyenes pörgetések",
    promoCodes: "Promóciós kódok",
    slots: "Nyerőgépek",
  },
  footer: {
    responsibleGaming: "Felelős játék",
    privacyPolicy: "Adatvédelmi irányelvek",
    cookiesPolicy: "Süti-szabályzat",
    bettingRules: "Játékszabályok",
    termsConditions: "Általános Szerződési Feltételek",
    contacts: "Kapcsolat",
  },
  forms: {
    login: {
      title: "Bejelentkezés",
      subtitle: "Lépj be a fiókodba.",
      emailOrUsername: "E-mail / Felhasználónév",
      password: "Jelszó",
      rememberMe: "Emlékezz rám",
      loginButton: "Bejelentkezés",
      forgotPassword: "Elfelejtett jelszó",
      closeLabel: "Bejelentkezési űrlap bezárása",
    },
    registration: {
      title: "Fiók létrehozása",
      subtitle: "Kezdd el a regisztrációt az alapadataiddal.",
      username: "Felhasználónév",
      email: "E-mail",
      password: "Jelszó",
      confirmPassword: "Jelszó megerősítése",
      country: "Ország",
      signUpButton: "Regisztráció",
      closeLabel: "Regisztrációs űrlap bezárása",
    },
  },
  intro: {
    ctaText: "Bónusz igénylése",
  },
  promoBanner: {
    heading: "Készen állsz a kezdésre?",
    overlayText: "A üdvözlő bónuszod vár rád",
  },
  stickyBanner: {
    headline: "Üdvözlő bónusz",
    disclaimer: "Feltételek érvényesek. {age}+",
    bullets: ["Gyors kifizetések", "Ügyfélszolgálat 0-24", "Biztonságos és engedélyezett"],
  },
  ageGate: {
    title: "Életkor-megerősítés",
    body: "A(z) {casinoName} kizárólag felnőttek számára készült. A belépéshez legalább {age} évesnek kell lenned.",
    confirmText: "Igen, {age}+ vagyok",
    declineText: "Nem, kilépek",
    footnote: "A folytatással megerősíted, hogy megfelelsz a saját joghatóságod szerinti szerencsejáték-korhatárnak.",
  },
};

const dictionaries: Record<string, CasinoV1Dictionary> = { en, el, de, no, nl, sv, fi, et, hu };

// additionalFooterTranslations is now only a legacy alias table for locales
// that might still resolve here without a full CasinoV1Dictionary entry -
// sv/fi have real entries in `dictionaries` now (see above), so this stays
// empty unless a future locale needs footer-only coverage the same way.
const additionalFooterTranslations: Record<string, Partial<CasinoV1Dictionary["footer"]>> = {};

function getAtPath(dictionary: CasinoV1Dictionary, path: string): string | undefined {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value && typeof value === "object" && key in value) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, dictionary) as string | undefined;
}

// Dictionaries are keyed by bare language subtags ("de", "nl"), but real
// sites use region-qualified locale codes ("de-DE", "nl-NL", per this
// project's content-library — see casino-dataset.ts). Without this,
// dictionaries[locale] would only ever hit for a locale typed as exactly
// "de", never "de-DE", and every region-qualified locale would silently
// render English UI chrome (nav/footer/forms/age gate) even though its
// actual page content is correctly localized. Tries the exact code first
// (so a future "pt-BR"-vs-"pt-PT" split can still override the bare
// subtag), then the subtag before the first "-", then falls through to
// English same as before.
export function translate(locale: string, path: string): string {
  const languageSubtag = locale.split("-")[0];
  if (path.startsWith("footer.")) {
    const footerKey = path.slice("footer.".length) as keyof CasinoV1Dictionary["footer"];
    const localizedFooter = additionalFooterTranslations[locale] ?? additionalFooterTranslations[languageSubtag];
    const footerValue = localizedFooter?.[footerKey];
    if (footerValue) return footerValue;
  }
  const dictionary = dictionaries[locale] ?? dictionaries[languageSubtag];
  const localized = dictionary ? getAtPath(dictionary, path) : undefined;
  if (localized) return localized;

  const fallback = getAtPath(en, path);
  if (fallback === undefined) {
    throw new Error(`Unknown casino-v1 translation key "${path}"`);
  }
  return fallback;
}

// Same locale-resolution as translate() (exact code, then bare subtag, then
// English) but for stickyBanner.bullets specifically - an array, so it
// can't share translate()'s string-only return type/getAtPath plumbing.
export function translateStickyBannerBullets(locale: string): string[] {
  const languageSubtag = locale.split("-")[0];
  const dictionary = dictionaries[locale] ?? dictionaries[languageSubtag];
  return dictionary?.stickyBanner.bullets ?? en.stickyBanner.bullets;
}
