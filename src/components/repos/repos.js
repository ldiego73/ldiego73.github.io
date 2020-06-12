import React, { useState, useEffect } from "react"
import axios from "axios"

import "./repos.scss"

const Repos = () => {
  const [repos, setRepos] = useState(null)

  const getRepos = async () => {
    const { data } = await axios.get(
      "https://api.github.com/users/ldiego73/repos?per_page=100"
    )

    const filters = data.filter(d => d.fork === false)
    const sorted = filters.sort((x, y) => {
      if (x.stargazers_count < y.stargazers_count) {
        return 1
      }

      if (x.stargazers_count > y.stargazers_count) {
        return -1
      }

      return 0
    })

    setRepos(sorted)
  }

  useEffect(() => {
    getRepos()
  }, [])

  return (
    <section className="repos">
      <div className="container">
        <h3 className="repos__title">Repositories</h3>
        <div className="repos__projects">
          {repos &&
            repos.map((r, i) => (
              <div key={`repo-${i}`} className="repos__project">
                <div className="repos__top">
                  <div className="repos__name">
                    <a
                      href={r.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={r.name}
                    >
                      <em className="fab fa-github" />
                      {r.name}
                    </a>
                  </div>
                  <div className="repos__description">{r.description}</div>
                </div>
                <div className="repos__stats">
                  <div className="repos__stats-left">
                    <span className="language">{r.language}</span>
                    <span className="start">
                      <em className="fas fa-star" />
                      {r.stargazers_count}
                    </span>
                    <span className="fork">
                      <em className="fas fa-code-branch" />
                      {r.forks}
                    </span>
                  </div>
                  <div className="repos__stats-right">{r.size} KB</div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </section>
  )
}

export { Repos }
