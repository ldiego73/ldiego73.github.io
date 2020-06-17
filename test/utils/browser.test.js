import { isBrowser } from "@utils/browser"

describe(`Browser Utils`, () => {
  it("Is window undefined", () => {
    const isWindowUndefined = isBrowser()

    expect(isWindowUndefined).toBeTruthy()
  })
})
