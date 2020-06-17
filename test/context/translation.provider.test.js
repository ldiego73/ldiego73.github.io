import { TranslationContext } from "@context//translation.context"
import { TranslationProvider } from "@context/translation.provider"
import { fireEvent, render } from "@testing-library/react"
import * as React from "react"

describe(`Translation Provider`, () => {
  it("renders correctly", () => {
    const { container, getByTestId } = render(
      <TranslationProvider>
        <TranslationContext.Consumer>
          {({ language, updateLanguage }) => (
            <>
              <div>Language: {language}</div>
              <button
                data-testid="btn-update-language"
                type="button"
                onClick={() => updateLanguage()}
              >
                Change language
              </button>
            </>
          )}
        </TranslationContext.Consumer>
      </TranslationProvider>
    )

    fireEvent.click(getByTestId("btn-update-language"))

    expect(container).toBeInTheDocument()
  })
})
