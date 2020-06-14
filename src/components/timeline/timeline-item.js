import PropTypes from "prop-types"
import React from "react"

const TimelineItem = ({ year, title, subtitle, details }) => (
  <li>
    <div className="timeline__item">
      <span className="timeline__date">{year}</span>
      <span className="timeline__title">{title}</span>
      <span className="timeline__subtitle">{subtitle}</span>
      <ul className="timeline__details">
        {details.map((d, j) => (
          <li key={`timeline-detail-${j}`}>{d}</li>
        ))}
      </ul>
    </div>
  </li>
)

TimelineItem.defaultProps = {
  details: [],
}

TimelineItem.propTypes = {
  year: PropTypes.number.isRequired,
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string.isRequired,
  details: PropTypes.arrayOf(PropTypes.string),
}

export { TimelineItem }
