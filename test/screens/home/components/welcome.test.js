import { Welcome } from "@screens/home/components/welcome"
import { fireEvent, render } from "@testing-library/react"
import * as React from "react"

describe(`Welcome`, () => {
  it("renders correctly", () => {
    const { container, getByTestId } = render(<Welcome />)

    fireEvent.mouseOver(getByTestId("welcome-wave"))
    fireEvent.mouseOut(getByTestId("welcome-wave"))

    expect(container).toBeInTheDocument()
  })
})
