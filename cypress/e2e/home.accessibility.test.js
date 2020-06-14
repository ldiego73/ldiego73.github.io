/// <reference types="Cypress" />

describe("Accessibility Home", () => {
  beforeEach(() => {
    cy.visit("/").get("main").injectAxe()
  })

  it("Has no detectable accessibility violations on load", () => {
    cy.checkA11y()
  })
})
