/// <reference types="Cypress" />

describe("Accessibility Home", () => {
  beforeEach(() => {
    cy.visit("/").get("main").injectAxe()
  })

  it("Has no detectable accessibility violations on load", () => {
    cy.configureAxe({
      rules: [{ id: "color-contrast", enabled: false }],
    })
    cy.checkA11y()
  })
})
