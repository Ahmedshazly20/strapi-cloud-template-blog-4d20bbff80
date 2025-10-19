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
      const { quizType, answers, user, scores, score }: QuizSubmission = ctx.request.body.data;

      console.log('📥 Quiz submission received:', { 
        quizType, 
        user, 
        answersCount: Object.keys(answers || {}).length 
      });

      // Validate quiz type
      const validQuizTypes: Array<'intelligence' | 'initial' | 'final'> = ['intelligence', 'initial', 'final'];
      if (!validQuizTypes.includes(quizType)) {
        return ctx.badRequest('Invalid quiz type');
      }

      // Get user documentId
      const userDocumentId: string = user || ctx.state.user.documentId;
      
      // ⭐ Check if user already completed this quiz (prevent duplicates)
      const existingResult = await strapi.entityService.findMany(
        'api::quiz-result.quiz-result',
        {
          filters: {
            user: { documentId: userDocumentId },
            quizType: quizType
          },
          limit: 1
        }
      );

      if (existingResult && existingResult.length > 0) {
        return ctx.badRequest('Quiz already completed. Cannot retake.');
      }

      let finalScore: number = 0;
      let categoryScores: CategoryScores = scores || {};

      // ========================================
      // INTELLIGENCE QUIZ
      // ========================================
      if (quizType === 'intelligence') {
        // Use scores calculated from frontend
        const scoresArray = Object.values(categoryScores).filter((v): v is number => typeof v === 'number');
        finalScore = score || scoresArray.reduce((acc: number, val: number) => acc + val, 0);

        console.log('🧠 Intelligence Quiz - Scores:', categoryScores, 'Total:', finalScore);

        // Create quiz result
        const result = await strapi.entityService.create('api::quiz-result.quiz-result', {
          data: {
            quizType,
            answers,
            scores: categoryScores,
            score: finalScore,
            user: userDocumentId,
            completed: true
          }
        });

        // Determine assigned path (highest score)
        const entries = Object.entries(categoryScores).filter(
          ([key, value]) => typeof value === 'number'
        ) as Array<[string, number]>;
        
        const assignedPath: string = entries.reduce((prev, curr) => 
          curr[1] > prev[1] ? curr : prev
        )[0];

        console.log('🎯 Assigned Path:', assignedPath);

        // Update user
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

        return {
          data: {
            id: result.id,
            documentId: result.documentId,
            quizType: result.quizType,
            score: result.score,
            scores: result.scores,
            createdAt: result.createdAt
          }
        };
      }

      // ========================================
      // PROGRAMMING QUIZZES (initial/final)
      // ========================================
      
      console.log('💻 Programming Quiz - Type:', quizType);
      
      // Get correct answers from config
      const correctAnswersForQuiz: Record<string, string> = correctAnswers[quizType];
      
      if (!correctAnswersForQuiz) {
        console.error('❌ No correct answers found for:', quizType);
        return ctx.badRequest(`No correct answers configured for quiz type: ${quizType}`);
      }

      // ⭐ Calculate score by comparing answers
      finalScore = 0;
      const detailedResults: Record<string, any> = {};
      
      Object.keys(answers).forEach((questionId: string) => {
        const userAnswer = answers[questionId];
        const correctAnswer = correctAnswersForQuiz[questionId];
        
        if (userAnswer === correctAnswer) {
          finalScore++;
          detailedResults[questionId] = { correct: true };
        } else {
          detailedResults[questionId] = { 
            correct: false, 
            userAnswer, 
            correctAnswer 
          };
        }
      });

      console.log('📊 Score Calculation:', {
        totalQuestions: Object.keys(answers).length,
        correctAnswers: finalScore,
        percentage: (finalScore / Object.keys(answers).length) * 100
      });

      // Create quiz result
      const result = await strapi.entityService.create('api::quiz-result.quiz-result', {
        data: {
          quizType,
          answers,
          score: finalScore, // ⭐ الدرجة المحسوبة
          user: userDocumentId,
          completed: true,
          timeSpent: 0
        }
      });

      console.log('✅ Quiz result created:', result.id);

      // ⭐ Update user's programming score
      const scoreField: string = quizType === 'initial' 
        ? 'initialProgrammingScore' 
        : 'finalProgrammingScore';

      // Calculate percentage (out of total questions)
      const totalQuestions: number = Object.keys(answers).length;
      const percentageScore: number = Math.round((finalScore / totalQuestions) * 100);

      console.log(`📝 Updating user ${scoreField}:`, percentageScore);

      const updatedUser = await strapi.entityService.update(
        'plugin::users-permissions.user',
        userDocumentId,
        {
          data: {
            [scoreField]: percentageScore // ⭐ حفظ النسبة المئوية
          }
        }
      );

      console.log('✅ User updated successfully');

      // Return response with score
      return {
        data: {
          id: result.id,
          documentId: result.documentId,
          quizType: result.quizType,
          score: finalScore, // الدرجة الخام
          totalScore: finalScore, // للتوافق مع Frontend
          percentage: percentageScore, // النسبة المئوية
          totalQuestions: totalQuestions,
          createdAt: result.createdAt
        }
      };
    },

    // ⭐ إضافة endpoint للتحقق من إكمال الاختبار
    async checkCompletion(ctx: any) {
      const { userId, quizType }: { userId?: string; quizType?: string } = ctx.query;

      if (!userId || !quizType) {
        return ctx.badRequest('Missing userId or quizType');
      }

      const existingResult = await strapi.entityService.findMany(
        'api::quiz-result.quiz-result',
        {
          filters: {
            user: { documentId: userId },
            quizType: quizType
          },
          limit: 1
        }
      );

      return {
        completed: existingResult && existingResult.length > 0,
        result: existingResult[0] || null
      };
    }
  })
);