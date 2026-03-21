module.exports = {
  ci: {
    collect: {
      url: [
        "https://missionmeetstech.com/",
        "https://missionmeetstech.com/about.html",
        "https://missionmeetstech.com/proposal-pulse.html",
      ],
      numberOfRuns: 1,
    },
    assert: {
      assertions: {
        "categories:performance": ["warn", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["warn", { minScore: 0.9 }],
        "categories:seo": ["warn", { minScore: 0.9 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
