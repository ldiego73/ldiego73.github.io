import {
  changeLanguage,
  defaultLanguage,
  LANGUAGE_KEY,
  languages,
  selectedLanguage,
  setupI18n,
} from "@utils/i18n"

const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn(),
}

beforeEach(() => {
  global.localStorage = localStorageMock
  global.localStorage.clear()
})

describe(`i18 Utils`, () => {
  it("Setup i18next correctly", () => {
    localStorage.setItem(LANGUAGE_KEY, "es")

    const i18n = setupI18n()

    expect(i18n).not.toBeNull()
  })

  it("Spanish and English available", () => {
    expect(languages.includes("es")).toBeTruthy()
    expect(languages.includes("en")).toBeTruthy()
  })

  it("Default language is correct", () => {
    expect(defaultLanguage).toBe(process.env.GATSBY_LANGUAGE_DEFAULT)
  })

  it("selected language default is equal to DEFAULT_LENGUAGE", () => {
    expect(selectedLanguage()).toBe(defaultLanguage)
  })

  it("selected language spanish", () => {
    const language = "es"

    changeLanguage(language)

    expect(selectedLanguage()).toBe(language)
  })
})
