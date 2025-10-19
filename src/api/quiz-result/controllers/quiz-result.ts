'use strict';

const correctAnswers = require('../../../../config/correctAnswers');

interface QuizSubmission {
  quizType: 'intelligence' | 'initial' | 'final';
  answers: Record<string, string>;
  user?: string;
  scores?: Record<string, number>;
  score?: number;
}

interface CategoryScores {
  linguistic?: number;
  logical?: number;
  interpersonal?: number;
  [key: string]: number | undefined;
}

module.exports = require('@strapi/strapi').factories.createCoreController(
  'api::quiz-result.quiz-result',
  ({ strapi }: any) => ({
    async create(ctx: any) {
      try {
        const { quizType, answers, user, scores, score }: QuizSubmission = ctx.request.body.data;

        console.log('📥 Quiz submission received:', { 
          quizType, 
          user, 
          answersCount: Object.keys(answers || {}).length,
          bodyData: ctx.request.body.data
        });

        // Validate required fields
        if (!quizType || !answers) {
          console.error('❌ Missing required fields');
          return ctx.badRequest('Missing required fields: quizType or answers');
        }

        // Validate quiz type
        const validQuizTypes: Array<'intelligence' | 'initial' | 'final'> = ['intelligence', 'initial', 'final'];
        if (!validQuizTypes.includes(quizType)) {
          console.error('❌ Invalid quiz type:', quizType);
          return ctx.badRequest('Invalid quiz type');
        }

        // Get user documentId
        const userDocumentId: string = user || ctx.state.user?.documentId;
        
        if (!userDocumentId) {
          console.error('❌ No user documentId found');
          return ctx.unauthorized('User not authenticated');
        }

        console.log('👤 User documentId:', userDocumentId);

        // ✅ CRITICAL FIX: Check USER PROFILE first
        let userProfile;
        try {
          userProfile = await strapi.entityService.findOne(
            'plugin::users-permissions.user',
            userDocumentId,
            {
              fields: ['id', 'documentId', 'intelligenceScores', 'assignedPath', 'initialProgrammingScore', 'finalProgrammingScore']
            }
          );
        } catch (error) {
          console.error('❌ Error fetching user profile:', error);
          return ctx.internalServerError('Failed to fetch user profile');
        }

        if (!userProfile) {
          console.error('❌ User not found:', userDocumentId);
          return ctx.badRequest('User not found');
        }

        console.log('✅ User profile loaded:', {
          id: userProfile.id,
          documentId: userProfile.documentId,
          intelligenceScores: userProfile.intelligenceScores,
          initialScore: userProfile.initialProgrammingScore,
          finalScore: userProfile.finalProgrammingScore
        });

        // ✅ Check if quiz already completed
        if (quizType === 'intelligence' && userProfile.intelligenceScores) {
          console.log('⚠️ Intelligence quiz already completed');
          return ctx.badRequest('Intelligence quiz already completed in your profile.');
        }

        if (quizType === 'initial' && userProfile.initialProgrammingScore !== null && userProfile.initialProgrammingScore !== undefined) {
          console.log('⚠️ Initial quiz already completed');
          return ctx.badRequest('Initial quiz already completed in your profile.');
        }

        if (quizType === 'final' && userProfile.finalProgrammingScore !== null && userProfile.finalProgrammingScore !== undefined) {
          console.log('⚠️ Final quiz already completed');
          return ctx.badRequest('Final quiz already completed in your profile.');
        }

        let finalScore: number = 0;
        let categoryScores: CategoryScores = scores || {};

        // ========================================
        // INTELLIGENCE QUIZ
        // ========================================
        if (quizType === 'intelligence') {
          console.log('🧠 Processing intelligence quiz...');
          
          // Use scores from frontend
          const scoresArray = Object.values(categoryScores).filter((v): v is number => typeof v === 'number');
          finalScore = score || scoresArray.reduce((acc: number, val: number) => acc + val, 0);

          console.log('📊 Intelligence scores:', categoryScores, 'Total:', finalScore);

          // Validate scores
          if (finalScore === 0 || Object.keys(categoryScores).length === 0) {
            console.error('❌ Invalid scores');
            return ctx.badRequest('Invalid intelligence scores');
          }

          // Create quiz result
          let result;
          try {
            result = await strapi.entityService.create('api::quiz-result.quiz-result', {
              data: {
                quizType,
                answers,
                scores: categoryScores,
                score: finalScore,
                user: userDocumentId,
                completed: true
              }
            });
            console.log('✅ Quiz result created:', result.id);
          } catch (error) {
            console.error('❌ Error creating quiz result:', error);
            return ctx.internalServerError('Failed to create quiz result');
          }

          // Determine assigned path
          const entries = Object.entries(categoryScores).filter(
            ([key, value]) => typeof value === 'number'
          ) as Array<[string, number]>;
          
          const assignedPath: string = entries.reduce((prev, curr) => 
            curr[1] > prev[1] ? curr : prev
          )[0];

          console.log('🎯 Assigned path:', assignedPath);

          // Update user profile
          try {
            await strapi.entityService.update(
              'plugin::users-permissions.user',
              userDocumentId,
              {
                data: {
                  intelligenceScores: categoryScores,
                  assignedPath: assignedPath
                }
              }
            );
            console.log('✅ User profile updated');
          } catch (error) {
            console.error('❌ Error updating user profile:', error);
            return ctx.internalServerError('Failed to update user profile');
          }

          return {
            data: {
              id: result.id,
              documentId: result.documentId,
              quizType: result.quizType,
              score: result.score,
              scores: result.scores,
              assignedPath: assignedPath,
              createdAt: result.createdAt
            }
          };
        }

        // ========================================
        // PROGRAMMING QUIZZES (initial/final)
        // ========================================
        
        console.log('💻 Processing programming quiz:', quizType);
        
        // Get correct answers
        const correctAnswersForQuiz: Record<string, string> = correctAnswers?.[quizType];
        
        if (!correctAnswersForQuiz) {
          console.error('❌ No correct answers found for:', quizType);
          return ctx.badRequest(`No correct answers configured for quiz type: ${quizType}`);
        }

        // Calculate score
        finalScore = 0;
        Object.keys(answers).forEach((questionId: string) => {
          const userAnswer = answers[questionId];
          const correctAnswer = correctAnswersForQuiz[questionId];
          
          if (userAnswer === correctAnswer) {
            finalScore++;
          }
        });

        const totalQuestions = Object.keys(answers).length;
        const percentageScore = Math.round((finalScore / totalQuestions) * 100);

        console.log('📊 Score:', {
          correct: finalScore,
          total: totalQuestions,
          percentage: percentageScore
        });

        // Create quiz result
        let result;
        try {
          result = await strapi.entityService.create('api::quiz-result.quiz-result', {
            data: {
              quizType,
              answers,
              score: finalScore,
              user: userDocumentId,
              completed: true,
              timeSpent: 0
            }
          });
          console.log('✅ Quiz result created:', result.id);
        } catch (error) {
          console.error('❌ Error creating quiz result:', error);
          return ctx.internalServerError('Failed to create quiz result');
        }

        // Update user score
        const scoreField = quizType === 'initial' ? 'initialProgrammingScore' : 'finalProgrammingScore';
        
        try {
          await strapi.entityService.update(
            'plugin::users-permissions.user',
            userDocumentId,
            {
              data: {
                [scoreField]: percentageScore
              }
            }
          );
          console.log(`✅ User ${scoreField} updated:`, percentageScore);
        } catch (error) {
          console.error('❌ Error updating user score:', error);
          return ctx.internalServerError('Failed to update user score');
        }

        return {
          data: {
            id: result.id,
            documentId: result.documentId,
            quizType: result.quizType,
            score: finalScore,
            totalScore: finalScore,
            percentage: percentageScore,
            totalQuestions: totalQuestions,
            createdAt: result.createdAt
          }
        };

      } catch (error: any) {
        console.error('❌ Unexpected error in quiz submission:', error);
        console.error('Error stack:', error.stack);
        return ctx.internalServerError('An unexpected error occurred: ' + error.message);
      }
    },

    async checkCompletion(ctx: any) {
      try {
        const { userId, quizType }: { userId?: string; quizType?: string } = ctx.query;

        if (!userId || !quizType) {
          return ctx.badRequest('Missing userId or quizType');
        }

        const userProfile = await strapi.entityService.findOne(
          'plugin::users-permissions.user',
          userId,
          {
            fields: ['intelligenceScores', 'initialProgrammingScore', 'finalProgrammingScore']
          }
        );

        if (!userProfile) {
          return { completed: false, result: null };
        }

        let completed = false;
        let score = null;

        if (quizType === 'intelligence') {
          completed = !!userProfile.intelligenceScores;
          score = userProfile.intelligenceScores;
        } else if (quizType === 'initial') {
          completed = userProfile.initialProgrammingScore !== null && userProfile.initialProgrammingScore !== undefined;
          score = userProfile.initialProgrammingScore;
        } else if (quizType === 'final') {
          completed = userProfile.finalProgrammingScore !== null && userProfile.finalProgrammingScore !== undefined;
          score = userProfile.finalProgrammingScore;
        }

        return {
          completed,
          score,
          message: completed ? 'Quiz already completed' : 'Quiz not completed'
        };
      } catch (error: any) {
        console.error('❌ Error checking completion:', error);
        return ctx.internalServerError('Failed to check completion');
      }
    }
  })
);
