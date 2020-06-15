import "./repos.scss"

import { Repository } from "@components/repository"
import axios from "axios"
import React, { useEffect, useState } from "react"

export const URL = "https://api.github.com/users/ldiego73/repos?per_page=100"

const Repos = () => {
  const [repos, setRepos] = useState(null)

  const getRepos = async () => {
    const { data } = await axios.get(URL)

    const filters = data.filter(d => d.fork === false)

    /* istanbul ignore next */
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
    <section id="repos" className="repos">
      <div className="container">
        <h3 className="repos__title">Repositories</h3>
        <div className="repos__projects">
          {repos &&
            repos.map((r, i) => (
              <Repository
                key={`repo-${i}`}
                data-testid={`repo-project-${i}`}
                name={r.name}
                url={r.html_url}
                description={r.description}
                language={r.language}
                starts={r.stargazers_count}
                forks={r.forks}
                size={r.size}
                className="repos__project"
              />
            ))}
        </div>
      </div>
    </section>
  )
}

export { Repos }