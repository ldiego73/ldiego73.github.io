/// <reference types="Cypress" />

describe("Accessibility Not Found", () => {
  beforeEach(() => {
    cy.visit("/404").get("main").injectAxe()
  })

  it("Has no detectable accessibility violations on load", () => {
    cy.checkA11y()
  })
})
