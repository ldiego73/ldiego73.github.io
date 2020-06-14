import { render } from "@testing-library/react"
import * as React from "react"

import { Layout } from "../main"

describe(`Layout`, () => {
  it("renders correctly", () => {
    const id = "test-element"
    const text = "Test Element"

    const { getByTestId, getByText } = render(
      <Layout>
        <div data-testid={id}>{text}</div>
      </Layout>
    )

    expect(getByTestId(id)).toBeInTheDocument()
    expect(getByText(text)).toBeInTheDocument()
  })
})
