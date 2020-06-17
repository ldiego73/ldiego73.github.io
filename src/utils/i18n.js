import i18n from "i18next"
import backend from "i18next-chained-backend"
import httpApi from "i18next-http-backend"
import localStorageBackend from "i18next-localstorage-backend"
import { initReactI18next } from "react-i18next"

import { isBrowser } from "./browser"

const LANGUAGE_KEY = "personal-site-language"
const LOCALES_KEY = "personal-site-locales-"
const defaultVersion = "v1.0"
const version = process.env.GATSBY_LANGUAGE_VERSION

const languages = ["es", "en"]
const defaultLanguage = process.env.GATSBY_LANGUAGE_DEFAULT

const changeLanguage = lng => {
  isBrowser() && window.localStorage.setItem(LANGUAGE_KEY, lng)
  i18n.changeLanguage(lng)
}

const selectedLanguage = () =>
  (isBrowser() && window.localStorage.getItem(LANGUAGE_KEY)) || defaultLanguage

const getVersions = () => {
  const versions = {}
  languages.forEach(l => {
    versions[l] = version
  })

  return versions
}

const setupI18n = () => {
  const language = isBrowser() && window.localStorage.getItem(LANGUAGE_KEY)
  const backends = [httpApi]
  const backendOptions = []

  let lng = defaultLanguage

  /* istanbul ignore else */
  if (languages.includes(language)) {
    lng = language
  }

  backendOptions.push({
    loadPath: "/locales/{{lng}}/{{ns}}.json",
  })

  /* istanbul ignore else */
  if (isBrowser()) {
    backends.push(localStorageBackend)
    backendOptions.push({
      prefix: LOCALES_KEY,
      expirationTime: 7 * 24 * 60 * 60 * 1000,
      defaultVersion,
      versions: getVersions(),
      store: window.localStorage,
    })
  }

  i18n
    .use(backend)
    .use(initReactI18next)
    .init({
      backend: {
        backends,
        backendOptions,
      },
      lng: lng,
      ns: [
        "translation",
        "educations",
        "experiences",
        "personal.skills",
        "technical.skills",
      ],
      fallbackLng: defaultLanguage,
      preload: [defaultLanguage],
      debug: process.env.NODE_ENV === "development",
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
    })
}

export {
  defaultLanguage,
  languages,
  changeLanguage,
  selectedLanguage,
  setupI18n,
  LANGUAGE_KEY,
  LOCALES_KEY,
}
