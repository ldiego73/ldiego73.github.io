import * as React from "react"
import { render, fireEvent, act } from "@testing-library/react"

import { Welcome } from "../welcome"

describe(`Welcome`, () => {
  it("renders correctly", () => {
    const { container, getByTestId } = render(<Welcome />)

    fireEvent.mouseOver(getByTestId("welcome-wave"))
    fireEvent.mouseOut(getByTestId("welcome-wave"))

    expect(container).toBeInTheDocument()
  })
})
