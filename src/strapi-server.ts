// 📁 src/extensions/users-permissions/strapi-server.js
// ✅ Custom override for /api/users/me endpoint

'use strict';

module.exports = (plugin) => {
  // ✅ Override the default /users/me controller
  plugin.controllers.user.me = async (ctx) => {
    try {
      // Check if user is authenticated
      if (!ctx.state.user) {
        return ctx.unauthorized('You must be authenticated to access this resource');
      }

      const userId = ctx.state.user.id;

      console.log('🔍 [/users/me] Fetching user data for ID:', userId);

      // ✅ Step 1: Get user profile with completedUnitsCount
      const user = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { id: userId },
        select: [
          'id',
          'documentId',
          'username',
          'email',
          'name',
          'phone',
          'hasSeenWelcome',
          'intelligenceScores',
          'assignedPath',
          'initialProgrammingScore',
          'finalProgrammingScore',
          'completedUnitsCount',
          'unitResults',
          'status',
          'createdAt',
          'updatedAt'
        ]
      });

      if (!user) {
        console.error('❌ [/users/me] User not found:', userId);
        return ctx.notFound('User not found');
      }

      // ✅ Ensure completedUnitsCount is a number
      if (typeof user.completedUnitsCount !== 'number') {
        console.warn('⚠️ [/users/me] completedUnitsCount invalid, setting to 0');
        user.completedUnitsCount = 0;
      }

      console.log('✅ [/users/me] User profile loaded:', {
        id: user.id,
        documentId: user.documentId,
        username: user.username,
        assignedPath: user.assignedPath,
        completedUnitsCount: user.completedUnitsCount
      });

      // ✅ Step 2: Get ALL unit-results from database
      const unitResults = await strapi.db.query('api::unit-result.unit-result').findMany({
        where: { user: userId },
        select: [
          'id',
          'documentId',
          'unitId',
          'quizType',
          'score',
          'passed',
          'attempts',
          'answers',
          'completedAt',
          'createdAt'
        ],
        orderBy: { createdAt: 'desc' }
      });

      console.log('📊 [/users/me] Unit results from DB:', {
        userId,
        count: unitResults.length,
        results: unitResults.map(r => ({
          unitId: r.unitId,
          quizType: r.quizType,
          passed: r.passed,
          score: r.score
        }))
      });

      // ✅ Step 3: Get quiz-results (intelligence, initial, final)
      const quizResults = await strapi.db.query('api::quiz-result.quiz-result').findMany({
        where: { user: userId },
        select: [
          'id',
          'documentId',
          'quizType',
          'score',
          'scores',
          'answers',
          'completed',
          'timeSpent',
          'createdAt'
        ],
        orderBy: { createdAt: 'desc' }
      });

      console.log('📝 [/users/me] Quiz results from DB:', {
        userId,
        count: quizResults.length,
        types: quizResults.map(r => r.quizType)
      });

      // ✅ Step 4: Merge unitResults (database + user.unitResults field)
      let allUnitResults = [...unitResults];

      // Check if user has unitResults in JSON field
      if (user.unitResults && Array.isArray(user.unitResults)) {
        console.log('📦 [/users/me] Found unitResults in user field:', user.unitResults.length);
        
        // Add any unique results from user.unitResults that aren't in DB
        user.unitResults.forEach(existingResult => {
          const exists = allUnitResults.some(r =>
            r.unitId === existingResult.unitId &&
            r.quizType === existingResult.quizType &&
            r.passed === existingResult.passed
          );
          
          if (!exists) {
            console.log('➕ [/users/me] Adding unique result from user field:', {
              unitId: existingResult.unitId,
              quizType: existingResult.quizType
            });
            allUnitResults.push(existingResult);
          }
        });
      }

      console.log('✅ [/users/me] Total merged unit results:', allUnitResults.length);

      // ✅ Step 5: Build response object
      const response = {
        id: user.documentId,
        documentId: user.documentId,
        username: user.username,
        email: user.email,
        name: user.name,
        phone: user.phone,
        hasSeenWelcome: user.hasSeenWelcome || false,
        intelligenceScores: user.intelligenceScores || null,
        assignedPath: user.assignedPath || null,
        initialProgrammingScore: user.initialProgrammingScore,
        finalProgrammingScore: user.finalProgrammingScore,
        completedUnits: user.completedUnits || [], // ✅✅✅ CRITICAL
        unitResults: allUnitResults,
        quizResults: quizResults,
        status: user.status || 'active',
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      };

      console.log('🎯 [/users/me] Returning complete user data:', {
        userId: response.id,
        documentId: response.documentId,
        completedUnitsCount: response.completedUnits?.length || 0,
        completedUnits: response.completedUnits,
        unitResultsCount: response.unitResults?.length || 0,
        quizResultsCount: response.quizResults?.length || 0,
        assignedPath: response.assignedPath,
        initialScore: response.initialProgrammingScore,
        finalScore: response.finalProgrammingScore
      });

      // ✅ Log detailed unit results for debugging
      if (response.unitResults && response.unitResults.length > 0) {
        console.log('📋 [/users/me] Detailed unit results:');
        response.unitResults.forEach((result, index) => {
          console.log(`  ${index + 1}.`, {
            unitId: result.unitId,
            quizType: result.quizType,
            passed: result.passed,
            score: result.score,
            completedAt: result.completedAt
          });
        });
      } else {
        console.warn('⚠️ [/users/me] No unit results to return');
      }

      return response;

    } catch (error) {
      console.error('❌ [/users/me] Fatal error:', {
        message: error.message,
        stack: error.stack,
        userId: ctx.state.user?.id
      });
      
      return ctx.internalServerError({
        error: {
          message: 'Failed to fetch user data',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        }
      });
    }
  };

  // ✅ Return modified plugin
  return plugin;
};