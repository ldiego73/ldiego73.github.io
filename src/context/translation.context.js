import { defaultLanguage } from "@utils/i18n"
import { createContext } from "react"

const TranslationContext = createContext({
  language: defaultLanguage,
  updateLanguage() {},
})

export { TranslationContext }
