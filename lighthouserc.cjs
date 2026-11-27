module.exports = {
  ci: {
    collect: {
      url: ["/?source=lab", "/writing/", "/writing/on-display/", "/zh/about/"]
        .map((path) => (process.env.LIGHTHOUSE_ORIGIN || "https://ashtonmilton.net") + path),
      numberOfRuns: 3,
      settings: { onlyCategories: ["performance", "accessibility", "best-practices", "seo"] }
    },
    assert: {
      assertions: {
        "categories:accessibility": ["warn", { minScore: 0.9 }],
        "categories:performance": ["warn", { minScore: 0.8 }],
        "cumulative-layout-shift": ["warn", { maxNumericValue: 0.1 }]
      }
    },
    upload: { target: "filesystem", outputDir: "lighthouse-reports" }
  }
};
