import "./repository.scss"

import PropTypes from "prop-types"
import React from "react"

const Repository = ({
  name,
  url,
  description,
  language,
  starts,
  forks,
  size,
  className,
}) => (
  <div className={`repository ${className}`}>
    <div className="repository__top">
      <div className="repository__name">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={name}
        >
          <em className="fab fa-github" />
          {name}
        </a>
      </div>
      <div className="repository__description">{description}</div>
    </div>
    <div className="repository__bottom">
      <div className="repository__stats">
        <span className="repository__language">{language}</span>
        <span className="repository__start">
          <em className="fas fa-star" />
          {starts}
        </span>
        <span className="repository__fork">
          <em className="fas fa-code-branch" />
          {forks}
        </span>
      </div>
      <div className="repository__size">{size} KB</div>
    </div>
  </div>
)

Repository.defaultProps = {
  description: "",
}

Repository.propTypes = {
  name: PropTypes.string.isRequired,
  url: PropTypes.string.isRequired,
  description: PropTypes.string,
  language: PropTypes.string.isRequired,
  starts: PropTypes.number.isRequired,
  forks: PropTypes.number.isRequired,
  size: PropTypes.number.isRequired,
}

export { Repository }
