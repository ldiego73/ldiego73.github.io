import "./contact.scss"

import React from "react"
import { useTranslation } from "react-i18next"

import { ContactForm } from "./contact-form"

const Contact = ({ url }) => {
  const URL = url || process.env.GATSBY_GETFORM_URL
  const { t } = useTranslation()

  const form = t("contact.form", { returnObjects: true })

  return (
    <section id="contact" className="contact">
      <div className="container">
        <h3 className="contact__title">{t("contact.title", "Contact")}</h3>
        <div className="contact__content">
          <div className="contact__address">
            <div className="contact__phone">
              <div className="contact__icon">
                <em className="fas fa-phone" />
              </div>
              <div className="contact__detail">
                <div className="contact__detail__title">
                  {t("contact.phone", "+51 943527457")}
                </div>
                <p className="contact_detail__info">
                  {t("contact.availability", "Mon to Fri 9am to 6 pm")}
                </p>
              </div>
            </div>
            <div className="contact__email">
              <div className="contact__icon">
                <em className="fas fa-envelope" />
              </div>
              <div className="contact__detail">
                <div className="contact__detail__title">
                  {t("contact.email", "lfdiego7@gmail.com")}
                </div>
                <p className="contact_detail__info">
                  {t("contact.query", "Send us your query anytime!")}
                </p>
              </div>
            </div>
          </div>
          <ContactForm url={URL} form={form} />
        </div>
      </div>
    </section>
  )
}

export { Contact }
