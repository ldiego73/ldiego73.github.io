/// <reference types="Cypress" />

describe("Home", () => {
  beforeEach(() => {
    cy.intercept("POST", "https://getform.io/f/**").as("postContactForm")
    cy.intercept("GET", "https://api.github.com/users/**").as("loadUsers")

    cy.visit("/")

    cy.wait("@loadUsers")
  })

  it("Complete contact form", () => {
    cy.get('[data-testid="contact"]').click()

    cy.wait(1000)
    cy.fixture("user").then(user => {
      cy.get('input[name="name"]').type(user.name, { force: true })
      cy.get('input[name="email"]').type(user.email, { force: true })
      cy.get('textarea[name="message"]').type(user.message, {
        force: true,
      })
      cy.get('[data-testid="contact-send"]').click({ force: true })

      cy.wait("@postContactForm")

      cy.get('[data-testid="server-status"]').should("be.visible")
    })
  })
})
