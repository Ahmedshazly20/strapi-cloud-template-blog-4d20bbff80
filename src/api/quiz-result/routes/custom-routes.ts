module.exports = {
    routes: [
      {
        method: 'GET',
        path: '/quiz-results/checkCompletion',
        handler: 'quiz-result.checkCompletion',
        config: {
          policies: [],
          middlewares: [],
        },
      },
    ],
  };