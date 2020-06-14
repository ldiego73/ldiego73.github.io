import data from "@data/home.json"
import axios from "axios"
import PropTypes from "prop-types"
import React, { useState } from "react"

const ContactForm = ({ url }) => {
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
      url,
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
    <div className="contact__form">
      <form onSubmit={handleOnSubmit}>
        <div className="contact__form__group">
          <input
            className="contact__name"
            required
            type="text"
            name="name"
            aria-label={data.contact.form.name}
            placeholder={data.contact.form.name}
          />
          <input
            className="contact__email"
            required
            type="email"
            name="email"
            aria-label={data.contact.form.email}
            placeholder={data.contact.form.email}
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
            aria-label={data.contact.form.message}
            placeholder={data.contact.form.message}
          />
        </div>
        {serverState.status && (
          <div className="contact__form__message" data-testid="server-status">
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
            {data.contact.form.send}
          </button>
        </div>
      </form>
    </div>
  )
}

ContactForm.propTypes = {
  url: PropTypes.string.isRequired,
}

export { ContactForm }
