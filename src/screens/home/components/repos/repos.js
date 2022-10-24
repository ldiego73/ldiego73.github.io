import "./repos.scss"

import { Repository } from "@components/repository"
import { useFetch } from "@hooks/use-fetch"
import React from "react"
import { useTranslation } from "react-i18next"

export const URL = `https://api.github.com/users/${process.env.GATSBY_GITHUB_USER}/repos?per_page=100`

function Repos() {
  const { t } = useTranslation()
  const [response] = useFetch(URL)

  return (
    <section id="repos" className="repos">
      <div className="container">
        <h3 className="repos__title">
          {t("repositories.title", "Repositories")}
        </h3>
        <div className="repos__projects">
          {response &&
            response.map((r, i) => (
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
