'use strict';

/**
 * unit-result controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::unit-result.unit-result', ({ strapi }) => ({
  async create(ctx) {
    try {
      const bodyData = ctx.request.body.data || ctx.request.body;
      const { user, unitId, quizType, answers, score, passed } = bodyData;

      console.log('📥 Unit quiz submission received:', {
        user,
        unitId,
        quizType,
        score,
        passed
      });

      // ✅ Validate required fields
      if (!user) {
        return ctx.badRequest('User is required');
      }

      if (!unitId) {
        return ctx.badRequest('unitId must be defined.');
      }

      if (!quizType || !['small', 'full', 'remedial'].includes(quizType)) {
        return ctx.badRequest('Invalid quiz type');
      }

      if (score === undefined || score === null) {
        return ctx.badRequest('Score is required');
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
        username: userProfile.username
      });

      // ✅ Check if already submitted (for full quiz only)
      if (quizType === 'full') {
        const existingResult = await strapi.db.query('api::unit-result.unit-result').findOne({
          where: {
            user: userProfile.id,
            unitId: unitId,
            quizType: 'full',
            passed: true
          }
        });

        if (existingResult) {
          console.log('⚠️ Unit already completed:', existingResult.id);
          return ctx.badRequest('You have already completed this unit successfully');
        }
      }

      // ✅ Create unit result
      const result = await strapi.entityService.create('api::unit-result.unit-result', {
        data: {
          user: userProfile.id, // Numeric ID for relation
          unitId: unitId, // Store as string
          quizType,
          answers: answers || {},
          score,
          passed: passed || false,
          attempts: 1,
          completedAt: new Date().toISOString()
        }
      });

      console.log('✅ Unit result created:', {
        id: result.id,
        unitId: result.unitId,
        quizType: result.quizType,
        score: result.score,
        passed: result.passed
      });

      return {
        data: {
          id: result.id,
          documentId: result.documentId,
          unitId: result.unitId,
          quizType: result.quizType,
          score: result.score,
          passed: result.passed,
          createdAt: result.createdAt
        }
      };

    } catch (error) {
      console.error('❌ Error creating unit result:', error);
      return ctx.internalServerError('Failed to save unit result: ' + error.message);
    }
  }
}));
