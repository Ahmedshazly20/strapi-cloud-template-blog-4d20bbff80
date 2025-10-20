'use strict';

/**
 * unit-result controller - SIMPLE VERSION with completedUnits
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

      // ✅ Get user
      const users = await strapi.db.query('plugin::users-permissions.user').findMany({
        where: { documentId: user },
        limit: 1
      });

      const userProfile = users[0];
      if (!userProfile) {
        return ctx.badRequest('User not found');
      }

      console.log('👤 User found:', userProfile.id, userProfile.username);

      // ✅ Check if FULL quiz already passed
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

      // ✅✅✅ CRITICAL: Update completedUnits if FULL quiz PASSED
      if (quizType === 'full' && passed === true) {
        try {
          // Get fresh user data
          const freshUser = await strapi.db.query('plugin::users-permissions.user').findOne({
            where: { id: userProfile.id },
            select: ['completedUnits']
          });

          let completedUnits = freshUser?.completedUnits || [];
          
          // Ensure it's an array
          if (!Array.isArray(completedUnits)) {
            completedUnits = [];
          }

          // Add unitId if not already there
          if (!completedUnits.includes(unitId)) {
            completedUnits.push(unitId);
            
            console.log('📝 Adding to completedUnits:', {
              userId: userProfile.id,
              unitId,
              previousCount: completedUnits.length - 1,
              newCount: completedUnits.length
            });

            // Update user
            await strapi.db.query('plugin::users-permissions.user').update({
              where: { id: userProfile.id },
              data: {
                completedUnits: completedUnits
              }
            });

            console.log('✅ completedUnits updated successfully');

            // Verify
            const verifyUser = await strapi.db.query('plugin::users-permissions.user').findOne({
              where: { id: userProfile.id },
              select: ['completedUnits']
            });
            
            console.log('🔍 Verification - completedUnits:', verifyUser?.completedUnits);
          } else {
            console.log('ℹ️ Unit already in completedUnits');
          }

        } catch (updateError) {
          console.error('❌ Error updating completedUnits:', updateError);
          // Don't throw - result is saved
        }
      }

      return {
        data: {
          id: result.id,
          documentId: result.documentId,
          unitId: result.unitId,
          quizType: result.quizType,
          score: result.score,
          passed: result.passed,
          createdAt: result.createdAt,
          message: passed && quizType === 'full'
            ? '🎉 تم فتح الوحدة التالية!'
            : 'تم حفظ نتيجتك'
        }
      };

    } catch (error) {
      console.error('❌ Error creating unit result:', error);
      return ctx.internalServerError('Failed to save result: ' + error.message);
    }
  }
}));
