import * as React from "react"
import { rest } from "msw"
import { setupServer } from "msw/node"
import { render, fireEvent, waitFor } from "@testing-library/react"

import { Contact, URL } from "../components/contact"

const server = setupServer(
  rest.post(URL, (_, res, ctx) => {
    return res(ctx.json({ status: true }))
  })
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe(`Contact`, () => {
  it("renders correctly", () => {
    const { container } = render(<Contact />)

    expect(container).toBeInTheDocument()
  })

  it("Send email to contact success", async () => {
    const { getByTestId, getByPlaceholderText } = render(<Contact />)

    const name = getByPlaceholderText("Enter your name")
    const email = getByPlaceholderText("Enter your email")
    const message = getByPlaceholderText("Enter your message")

    fireEvent.change(name, { target: { value: "test name" } })
    fireEvent.change(email, { target: { value: "test@mail.com" } })
    fireEvent.change(message, { target: { value: "test message" } })

    fireEvent.click(getByTestId("send"))

    await waitFor(() => getByTestId("server-status"), { timeout: 5000 })

    expect(getByTestId("server-status")).toHaveTextContent("Thanks!")
  })

  it("Send email to contact error", async () => {
    const error =
      "An error occurred while submitting the form, please try again"

    server.use(
      rest.post(URL, (_, res, ctx) => {
        return res(ctx.status(400), ctx.json({ error }))
      })
    )

    const { getByTestId, getByPlaceholderText } = render(<Contact />)

    const name = getByPlaceholderText("Enter your name")
    const email = getByPlaceholderText("Enter your email")
    const message = getByPlaceholderText("Enter your message")

    fireEvent.change(name, { target: { value: "test name" } })
    fireEvent.change(email, { target: { value: "test@mail.com" } })
    fireEvent.change(message, { target: { value: "test message" } })

    fireEvent.click(getByTestId("send"))

    await waitFor(() => getByTestId("server-status"), { timeout: 5000 })

    expect(getByTestId("server-status")).toHaveTextContent(error)
  })
})
