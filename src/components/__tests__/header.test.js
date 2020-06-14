import { fireEvent, render } from "@testing-library/react"
import * as React from "react"

import { Header } from "../header"

describe(`Header`, () => {
  it("renders correctly", () => {
    const { container } = render(<Header />)

    expect(container).toBeInTheDocument()
  })

  it("open menu mobile", () => {
    const { getByTestId, container } = render(<Header />)

    fireEvent.click(getByTestId("header-menu"))

    expect(
      container.querySelector(".header__mobile").classList.contains("open")
    ).toBeTruthy()
  })

  it("close menu mobile", () => {
    const { container } = render(<Header />)

    fireEvent.click(container.querySelector(".header__link.mobile"))

    expect(
      container.querySelector(".header__mobile").classList.contains("open")
    ).toBeFalsy()
  })
})
