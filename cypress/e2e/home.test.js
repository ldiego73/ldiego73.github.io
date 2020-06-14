/// <reference types="Cypress" />

describe("Home", () => {
  beforeEach(() => {
    cy.server()
    cy.route("GET", "https://api.github.com/users/**").as("loadUsers")

    cy.visit("/")

    cy.wait("@loadUsers")
  })

  describe("Welcome", () => {
    it("Hover on the wave", () => {
      cy.get(".wave-hand").trigger("mouseover")
    })

    it("Redirect to Github", () => {
      cy.get('[data-testid="github"]').click()
    })

    it("Redirect to Linkedin", () => {
      cy.get('[data-testid="linkedin"]').click()
    })

    it("Redirect to Twitter", () => {
      cy.get('[data-testid="twitter"]').click()
    })

    it("Redirect to Instagram", () => {
      cy.get('[data-testid="instagram"]').click()
    })

    it("Redirect to Email", () => {
      cy.get('[data-testid="email"]').click()
    })
  })

  describe("About", () => {
    it("Move to About", () => {
      cy.get('[data-testid="about"]').click()
    })

    it("Download CV", () => {
      cy.get('[data-testid="resume-download"]').click({ force: true })
    })
  })

  describe("Resume", () => {
    it("Move to Resume", () => {
      cy.get('[data-testid="resume"]').click()
    })
  })

  describe("Repositories", () => {
    it("Move to Repositories", () => {
      cy.get('[data-testid="repositories"]').click()
    })
  })

  describe("Contact", () => {
    it("Move to Contact", () => {
      cy.get('[data-testid="contact"]').click()
    })
  })

  describe("Footer", () => {
    it("Move to Bottom", () => {
      cy.scrollTo("bottom")
    })

    it("Move to Top", () => {
      cy.scrollTo("bottom")
        .get('[data-testid="top-button"]')
        .click({ force: true })
    })

    it("Redirect to Github", () => {
      cy.scrollTo("bottom")
        .get('[data-testid="footer-github"]')
        .click({ force: true })
    })

    it("Redirect to Linkedin", () => {
      cy.scrollTo("bottom")
        .get('[data-testid="footer-linkedin"]')
        .click({ force: true })
    })

    it("Redirect to Twitter", () => {
      cy.scrollTo("bottom")
        .get('[data-testid="footer-twitter"]')
        .click({ force: true })
    })

    it("Redirect to Instagram", () => {
      cy.scrollTo("bottom")
        .get('[data-testid="footer-instagram"]')
        .click({ force: true })
    })

    it("Redirect to Email", () => {
      cy.scrollTo("bottom")
        .get('[data-testid="footer-email"]')
        .click({ force: true })
    })
  })
})
