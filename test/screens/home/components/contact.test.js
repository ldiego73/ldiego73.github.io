import { Contact } from "@screens/home/components/contact"
import { fireEvent, render, waitFor } from "@testing-library/react"
import { rest } from "msw"
import { setupServer } from "msw/node"
import * as React from "react"

const URL = "https://127.0.0.1/form/contact"

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
    const { container } = render(<Contact url={URL} />)

    expect(container).toBeInTheDocument()
  })

  it("Send email to contact success", async () => {
    const { getByTestId } = render(<Contact url={URL} />)

    const name = getByTestId("contact-name")
    const email = getByTestId("contact-email")
    const message = getByTestId("contact-message")

    fireEvent.change(name, { target: { value: "test name" } })
    fireEvent.change(email, { target: { value: "test@mail.com" } })
    fireEvent.change(message, { target: { value: "test message" } })

    fireEvent.click(getByTestId("contact-send"))

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

    const { getByTestId } = render(<Contact url={URL} />)

    const name = getByTestId("contact-name")
    const email = getByTestId("contact-email")
    const message = getByTestId("contact-message")

    fireEvent.change(name, { target: { value: "test name" } })
    fireEvent.change(email, { target: { value: "test@mail.com" } })
    fireEvent.change(message, { target: { value: "test message" } })

    fireEvent.click(getByTestId("contact-send"))

    await waitFor(() => getByTestId("server-status"), { timeout: 5000 })

    expect(getByTestId("server-status")).toHaveTextContent(error)
  })
})
