/* eslint-disable react/jsx-no-constructed-context-values */
import { changeLanguage, selectedLanguage, setupI18n } from "@utils/i18n"
import React, { useLayoutEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { TranslationContext } from "./translation.context"

setupI18n()

function TranslationProvider({ children }) {
  const { i18n } = useTranslation()
  const [language, setLanguage] = useState(selectedLanguage())

  const updateLanguage = lng => {
    setLanguage(lng)
  }

  useLayoutEffect(() => {
    i18n.language !== language && changeLanguage(language)
  }, [language])

  return (
    <TranslationContext.Provider value={{ language, updateLanguage }}>
      {children}
    </TranslationContext.Provider>
  )
}

export { TranslationProvider }
