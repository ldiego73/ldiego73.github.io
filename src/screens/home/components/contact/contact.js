import "./contact.scss"

import data from "@data/home.json"
import React from "react"

import { ContactForm } from "./contact-form"

export const URL = "https://getform.io/f/22a53547-bbe8-47ae-a1f0-d079486df4c4"

const Contact = () => (
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
              <div className="contact__detail__title">{data.contact.phone}</div>
              <p className="contact_detail__info">
                {data.contact.availability}
              </p>
            </div>
          </div>
          <div className="contact__email">
            <div className="contact__icon">
              <em className="fas fa-envelope" />
            </div>
            <div className="contact__detail">
              <div className="contact__detail__title">{data.contact.email}</div>
              <p className="contact_detail__info">{data.contact.query}</p>
            </div>
          </div>
        </div>
        <ContactForm url={URL} />
      </div>
    </div>
  </section>
)

export { Contact }
