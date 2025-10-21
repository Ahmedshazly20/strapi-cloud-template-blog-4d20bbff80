'use strict';

/**
 * unit-result controller - FIXED VERSION with completedUnitsCount
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::unit-result.unit-result', ({ strapi }) => ({
  async create(ctx) {
    try {
      const bodyData = ctx.request.body.data || ctx.request.body;
      const { user, unitId, quizType, answers, score, passed } = bodyData;

      console.log('🔥 Unit quiz submission:', {
        user,
        unitId,
        quizType,
        score,
        passed,
        timestamp: new Date().toISOString()
      });

      // ✅ Validate
      if (!user || !unitId || !quizType || score === undefined) {
        return ctx.badRequest('Missing required fields');
      }

      if (!['small', 'full', 'remedial'].includes(quizType)) {
        return ctx.badRequest('Invalid quiz type');
      }

      // ✅ Get user by documentId
      const users = await strapi.db.query('plugin::users-permissions.user').findMany({
        where: { documentId: user },
        limit: 1
      });

      const userProfile = users[0];
      if (!userProfile) {
        return ctx.badRequest('User not found');
      }

      console.log('👤 User found:', {
        id: userProfile.id,
        documentId: userProfile.documentId,
        username: userProfile.username,
        currentCount: userProfile.completedUnitsCount
      });

      // ✅ Check if FULL quiz already passed for this unit
      if (quizType === 'full') {
        const existingPassed = await strapi.db.query('api::unit-result.unit-result').findOne({
          where: {
            user: userProfile.id,
            unitId: unitId,
            quizType: 'full',
            passed: true
          }
        });

        if (existingPassed) {
          console.log('⚠️ Unit already completed');
          return ctx.badRequest('You have already completed this unit successfully');
        }
      }

      // ✅ Create unit result
      const result = await strapi.entityService.create('api::unit-result.unit-result', {
        data: {
          user: userProfile.id,
          unitId: unitId,
          quizType,
          answers: answers || {},
          score,
          passed: passed || false,
          attempts: 1,
          completedAt: new Date().toISOString(),
          publishedAt: new Date().toISOString()
        }
      });

      console.log('✅ Unit result created:', result.id);

      // ✅✅✅ UPDATE completedUnitsCount if FULL quiz PASSED
      let newCount = userProfile.completedUnitsCount || 0;
      
      if (quizType === 'full' && passed === true) {
        try {
          // Get current count (fresh from DB)
          const freshUser = await strapi.db.query('plugin::users-permissions.user').findOne({
            where: { id: userProfile.id },
            select: ['id', 'completedUnitsCount']
          });

          const currentCount = freshUser?.completedUnitsCount || 0;
          newCount = Math.min(currentCount + 1, 5); // Max 5 units

          console.log('📊 Updating completedUnitsCount:', {
            userId: userProfile.id,
            unitId,
            currentCount,
            newCount
          });

          // ✅✅✅ CRITICAL FIX: Use query builder directly
          await strapi.db.query('plugin::users-permissions.user').update({
            where: { id: userProfile.id },
            data: {
              completedUnitsCount: newCount,
              updatedAt: new Date()
            }
          });

          console.log('✅ completedUnitsCount updated successfully to:', newCount);

          // ✅ Verify the update
          const verifyUser = await strapi.db.query('plugin::users-permissions.user').findOne({
            where: { id: userProfile.id },
            select: ['completedUnitsCount']
          });
          
          console.log('🔍 Verification - completedUnitsCount after update:', verifyUser?.completedUnitsCount);

          if (verifyUser?.completedUnitsCount !== newCount) {
            console.error('❌ CRITICAL: Update verification failed!');
            console.error('Expected:', newCount, 'Got:', verifyUser?.completedUnitsCount);
          }

        } catch (updateError) {
          console.error('❌ Error updating completedUnitsCount:', updateError);
          console.error('Error details:', {
            message: updateError.message,
            stack: updateError.stack
          });
          // Don't throw - result is already saved
        }
      }

      // ✅ Return success response
      return {
        data: {
          id: result.id,
          documentId: result.documentId,
          unitId: result.unitId,
          quizType: result.quizType,
          score: result.score,
          passed: result.passed,
          completedUnitsCount: newCount, // ✅ Return new count
          createdAt: result.createdAt,
          message: passed && quizType === 'full'
            ? `🎉 تم فتح الوحدة التالية! (إجمالي الوحدات المكتملة: ${newCount}/5)`
            : 'تم حفظ نتيجتك'
        }
      };

    } catch (error) {
      console.error('❌ Error creating unit result:', error);
      console.error('Error stack:', error.stack);
      return ctx.internalServerError('Failed to save result: ' + error.message);
    }
  },

  // ✅ Add custom endpoint to get user progress
  async getUserProgress(ctx) {
    try {
      const userId = ctx.state.user?.id;
      
      if (!userId) {
        return ctx.unauthorized('You must be logged in');
      }

      const user = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { id: userId },
        select: ['id', 'documentId', 'username', 'completedUnitsCount', 'assignedPath']
      });

      const unitResults = await strapi.db.query('api::unit-result.unit-result').findMany({
        where: { 
          user: userId,
          quizType: 'full',
          passed: true
        },
        select: ['unitId', 'score', 'completedAt']
      });

      return {
        data: {
          userId: user.documentId,
          username: user.username,
          assignedPath: user.assignedPath,
          completedUnitsCount: user.completedUnitsCount || 0,
          completedUnits: unitResults
        }
      };

    } catch (error) {
      console.error('❌ Error fetching user progress:', error);
      return ctx.internalServerError('Failed to fetch progress');
    }
  }
}));