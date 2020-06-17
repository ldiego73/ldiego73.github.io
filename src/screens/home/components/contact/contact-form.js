import axios from "axios"
import PropTypes from "prop-types"
import React, { useState } from "react"

const ContactForm = ({ url, form }) => {
  const [serverState, setServerState] = useState({
    submitting: false,
    status: null,
  })

  const handleServerResponse = (ok, msg, submitForm) => {
    setServerState({
      submitting: false,
      status: { ok, msg },
    })
    if (ok) {
      submitForm.reset()
    }
  }

  const handleOnSubmit = e => {
    e.preventDefault()

    const submitForm = e.target

    setServerState({ submitting: true })

    axios({
      method: "post",
      url,
      data: new FormData(submitForm),
    })
      .then(() => {
        handleServerResponse(true, form.thanks, submitForm)
      })
      .catch(r => {
        handleServerResponse(false, r.response.data.error, submitForm)
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
            aria-label={form.name}
            placeholder={form.name}
            data-testid="contact-name"
          />
          <input
            className="contact__email"
            required
            type="email"
            name="email"
            aria-label={form.email}
            placeholder={form.email}
            data-testid="contact-email"
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
            aria-label={form.message}
            placeholder={form.message}
            data-testid="contact-message"
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
            data-testid="contact-send"
          >
            {form.send}
          </button>
        </div>
      </form>
    </div>
  )
}

ContactForm.propTypes = {
  url: PropTypes.string.isRequired,
  form: PropTypes.shape({
    name: PropTypes.string.isRequired,
    email: PropTypes.string.isRequired,
    message: PropTypes.string.isRequired,
    send: PropTypes.string.isRequired,
  }).isRequired,
}

export { ContactForm }
