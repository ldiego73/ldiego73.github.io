/// <reference types="Cypress" />

describe("Not found", () => {
  beforeEach(() => {
    cy.visit("/404")
  })

  it("Redirect to Home using atribbute data", () => {
    cy.get('[data-testid="header-home"]').click()
  })

  it("Redirect to Home using navigate", () => {
    cy.visit("/")
  })
})
