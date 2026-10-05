/** Single place for identity, links and integrations. Add a social network by appending to SOCIALS. */
export const SITE = {
  name: "Luis Diego",
  handle: "ldiego73",
  url: "https://ldiego73.github.io",
  email: "lfdiego7@gmail.com",
  calendly: "https://calendly.com/ldiego73/60-minute-meeting",
  /**
   * Form endpoint (Getform, Formspree or similar; public by design). Paste the endpoint URL here.
   * While empty, the contact form falls back to opening a pre-filled email.
   */
  formEndpoint: "",
  githubUser: "ldiego73",
  mediumUser: "ldiego73",
  resume: { es: "/resume/luis-diego-cv-es.pdf", en: "/resume/luis-diego-cv-en.pdf" },
};

export const SOCIALS: Array<{ name: string; url: string; icon: "github" | "linkedin" | "medium" | "mail" }> = [
  { name: "GitHub", url: "https://github.com/ldiego73", icon: "github" },
  { name: "LinkedIn", url: "https://pe.linkedin.com/in/ldiego73", icon: "linkedin" },
  { name: "Medium", url: "https://medium.com/@ldiego73", icon: "medium" },
  { name: "Email", url: "mailto:lfdiego7@gmail.com", icon: "mail" },
];
