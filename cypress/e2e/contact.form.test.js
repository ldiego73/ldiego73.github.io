/// <reference types="Cypress" />

describe("Home", () => {
  beforeEach(() => {
    cy.server()
    cy.route("POST", "https://getform.io/f/**").as("postContactForm")
    cy.route("GET", "https://api.github.com/users/**").as("loadUsers")

    cy.visit("/")

    cy.wait("@loadUsers")

    cy.fixture("user.json").then(user => {
      this.user = user
    })
  })

  it("Complete contact form", () => {
    cy.get('[data-testid="contact"]').click()

    cy.wait(1000)

    cy.get('input[name="name"]').type(this.user.name, { force: true })
    cy.get('input[name="email"]').type(this.user.email, { force: true })
    cy.get('textarea[name="message"]').type(this.user.message, { force: true })
    cy.get('[data-testid="contact-send"]').click({ force: true })

    cy.wait("@postContactForm")

    cy.get('[data-testid="server-status"]').should("be.visible")
  })
})
