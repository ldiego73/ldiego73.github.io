/// <reference types="Cypress" />

describe("Home", () => {
  const getId = id => cy.get(id)
  const performClick = id => getId(id).click({ force: true })
  const scrollBottomAndClick = id =>
    cy.scrollTo("bottom").get(id).click({ force: true })

  beforeEach(() => {
    cy.server()
    cy.route("GET", "https://api.github.com/users/**").as("loadUsers")

    cy.visit("/")

    cy.wait("@loadUsers")
  })

  describe("Welcome", () => {
    it("Hover on the wave", () => {
      getId(".wave-hand").trigger("mouseover")
    })

    it("Redirect to Github", () => {
      performClick('[data-testid="github"]')
    })

    it("Redirect to Linkedin", () => {
      performClick('[data-testid="linkedin"]')
    })

    it("Redirect to Twitter", () => {
      performClick('[data-testid="twitter"]')
    })

    it("Redirect to Instagram", () => {
      performClick('[data-testid="instagram"]')
    })

    it("Redirect to Email", () => {
      performClick('[data-testid="email"]')
    })
  })

  describe("About", () => {
    it("Move to About", () => {
      performClick('[data-testid="about"]')
    })

    it("Download CV", () => {
      performClick('[data-testid="resume-download"]')
    })
  })

  describe("Resume", () => {
    it("Move to Resume", () => {
      performClick('[data-testid="resume"]')
    })
  })

  describe("Repositories", () => {
    it("Move to Repositories", () => {
      performClick('[data-testid="repositories"]')
    })
  })

  describe("Contact", () => {
    it("Move to Contact", () => {
      performClick('[data-testid="contact"]')
    })
  })

  describe("Footer", () => {
    it("Move to Bottom", () => {
      cy.scrollTo("bottom")
    })

    it("Move to Top", () => {
      scrollBottomAndClick('[data-testid="top-button"]')
    })

    it("Redirect to Github", () => {
      scrollBottomAndClick('[data-testid="footer-github"]')
    })

    it("Redirect to Linkedin", () => {
      scrollBottomAndClick('[data-testid="footer-linkedin"]')
    })

    it("Redirect to Twitter", () => {
      scrollBottomAndClick('[data-testid="footer-twitter"]')
    })

    it("Redirect to Instagram", () => {
      scrollBottomAndClick('[data-testid="footer-instagram"]')
    })

    it("Redirect to Email", () => {
      scrollBottomAndClick('[data-testid="footer-email"]')
    })
  })
})
