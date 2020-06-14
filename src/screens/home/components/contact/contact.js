import "./contact.scss"

import axios from "axios"
import React, { useState } from "react"

export const URL = "https://getform.io/f/22a53547-bbe8-47ae-a1f0-d079486df4c4"

const Contact = () => {
  const [serverState, setServerState] = useState({
    submitting: false,
    status: null,
  })

  const handleServerResponse = (ok, msg, form) => {
    setServerState({
      submitting: false,
      status: { ok, msg },
    })
    if (ok) {
      form.reset()
    }
  }

  const handleOnSubmit = e => {
    e.preventDefault()

    const form = e.target

    setServerState({ submitting: true })

    axios({
      method: "post",
      url: URL,
      data: new FormData(form),
    })
      .then(() => {
        handleServerResponse(true, "Thanks!", form)
      })
      .catch(r => {
        handleServerResponse(false, r.response.data.error, form)
      })
  }
  return (
    <section id="contact" className="contact">
      <div className="container">
        <h3 className="contact__title">Contact</h3>
        <div className="contact__content">
          <div className="contact__address">
            <div className="contact__phone">
              <div className="contact__icon">
                <em className="fas fa-phone" />
              </div>
              <div className="contact__detail">
                <h5>+51 943527457</h5>
                <p>Mon to Fri 9am to 6 pm</p>
              </div>
            </div>
            <div className="contact__email">
              <div className="contact__icon">
                <em className="fas fa-envelope" />
              </div>
              <div className="contact__detail">
                <h5>lfdiego7@gmail.com</h5>
                <p>Send us your query anytime!</p>
              </div>
            </div>
          </div>
          <div className="contact__form">
            <form onSubmit={handleOnSubmit}>
              <div className="contact__form__group">
                <input
                  className="contact__name"
                  required
                  type="text"
                  name="name"
                  aria-label="Name"
                  placeholder="Enter your name"
                />
                <input
                  className="contact__email"
                  required
                  type="email"
                  name="email"
                  aria-label="Email"
                  placeholder="Enter your email"
                />
                <div className="contact__captcha">
                  <div
                    className="g-recaptcha"
                    data-theme="dark"
                    data-sitekey={process.env.GATSBY_RECAPTCHA_KEY}
                  />
                </div>
              </div>
              <div className="contact__form__group">
                <textarea
                  className="contact__message"
                  required
                  name="message"
                  aria-label="Message"
                  placeholder="Enter your message"
                />
              </div>
              {serverState.status && (
                <div
                  className="contact__form__message"
                  data-testid="server-status"
                >
                  <p className={!serverState.status.ok ? "error" : ""}>
                    {serverState.status.msg}
                  </p>
                </div>
              )}
              <div className="contact__form__send">
                <button
                  type="submit"
                  className="button"
                  disabled={serverState.submitting}
                  data-testid="send"
                >
                  Send Message
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  )
}

export { Contact }
