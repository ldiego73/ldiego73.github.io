/// <reference types="Cypress" />

describe("Accessibility Not Found", () => {
  beforeEach(() => {
    cy.visit("/404").get("main").injectAxe()
  })

  it("Has no detectable accessibility violations on load", () => {
    cy.configureAxe({
      rules: [{ id: "color-contrast", enabled: false }],
    })
    cy.checkA11y()
  })
})
