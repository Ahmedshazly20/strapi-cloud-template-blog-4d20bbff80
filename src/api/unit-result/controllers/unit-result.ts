'use strict';

/**
 * unit-result controller - ENHANCED VERSION
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::unit-result.unit-result', ({ strapi }) => ({
  async create(ctx) {
    try {
      const bodyData = ctx.request.body.data || ctx.request.body;
      const { user, unitId, quizType, answers, score, passed } = bodyData;

      console.log('🔥 Unit quiz submission received:', {
        user,
        unitId,
        quizType,
        score,
        passed,
        timestamp: new Date().toISOString()
      });

      // ✅ Validate required fields
      if (!user) {
        console.error('❌ Validation error: User is required');
        return ctx.badRequest('User is required');
      }

      if (!unitId) {
        console.error('❌ Validation error: unitId is required');
        return ctx.badRequest('unitId must be defined.');
      }

      if (!quizType || !['small', 'full', 'remedial'].includes(quizType)) {
        console.error('❌ Validation error: Invalid quiz type:', quizType);
        return ctx.badRequest('Invalid quiz type. Must be: small, full, or remedial');
      }

      if (score === undefined || score === null) {
        console.error('❌ Validation error: Score is required');
        return ctx.badRequest('Score is required');
      }

      // ✅ Get user by documentId
      const users = await strapi.db.query('plugin::users-permissions.user').findMany({
        where: { documentId: user },
        limit: 1
      });

      const userProfile = users[0];
      if (!userProfile) {
        console.error('❌ User not found with documentId:', user);
        return ctx.badRequest('User not found');
      }

      console.log('👤 User found:', {
        id: userProfile.id,
        documentId: userProfile.documentId,
        username: userProfile.username
      });

      // ✅ Check if already submitted (for FULL quiz only - prevent duplicates)
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
          console.log('⚠️ Unit already completed successfully:', {
            resultId: existingResult.id,
            unitId: existingResult.unitId,
            score: existingResult.score,
            completedAt: existingResult.completedAt
          });
          return ctx.badRequest('You have already completed this unit successfully');
        }
      }

      // ✅ Create unit result
      const result = await strapi.entityService.create('api::unit-result.unit-result', {
        data: {
          user: userProfile.id, // Numeric ID for relation
          unitId: unitId, // Store as string documentId
          quizType,
          answers: answers || {},
          score,
          passed: passed || false,
          attempts: 1,
          completedAt: new Date().toISOString(),
          publishedAt: new Date().toISOString() // IMPORTANT for Strapi v5
        }
      });

      console.log('✅ Unit result created successfully:', {
        id: result.id,
        documentId: result.documentId,
        unitId: result.unitId,
        quizType: result.quizType,
        score: result.score,
        passed: result.passed,
        userId: userProfile.id,
        createdAt: result.createdAt
      });

      // ✅ CRITICAL: Update user's unitResults JSON field
      let currentUnitResults = [];
      
      try {
        // Get fresh user data
        const freshUser = await strapi.db.query('plugin::users-permissions.user').findOne({
          where: { id: userProfile.id },
          select: ['unitResults']
        });
        
        currentUnitResults = freshUser?.unitResults || [];
        
        // Ensure it's an array
        if (!Array.isArray(currentUnitResults)) {
          currentUnitResults = [];
        }
        
        console.log('📊 Current user unitResults before update:', {
          userId: userProfile.id,
          existingCount: currentUnitResults.length
        });
        
      } catch (error) {
        console.error('⚠️ Error reading current unitResults:', error);
        currentUnitResults = [];
      }
      
      // Add new result
      const newResult = {
        id: result.id,
        documentId: result.documentId,
        unitId: result.unitId,
        quizType: result.quizType,
        score: result.score,
        passed: result.passed,
        answers: result.answers,
        completedAt: result.completedAt,
        createdAt: result.createdAt
      };
      
      const updatedUnitResults = [...currentUnitResults, newResult];

      // Update user profile with new unitResults
      await strapi.db.query('plugin::users-permissions.user').update({
        where: { id: userProfile.id },
        data: {
          unitResults: updatedUnitResults
        }
      });

      console.log('✅ User unitResults updated successfully:', {
        userId: userProfile.id,
        previousCount: currentUnitResults.length,
        newCount: updatedUnitResults.length,
        latestResult: {
          unitId: result.unitId,
          quizType: result.quizType,
          passed: result.passed,
          score: result.score
        }
      });
      
      // ✅ Verify the update
      const verifyUser = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { id: userProfile.id },
        select: ['unitResults']
      });
      
      console.log('🔍 Verification - unitResults count:', verifyUser?.unitResults?.length || 0);

      // Return clean response
      return {
        data: {
          id: result.id,
          documentId: result.documentId,
          unitId: result.unitId,
          quizType: result.quizType,
          score: result.score,
          passed: result.passed,
          createdAt: result.createdAt,
          message: passed 
            ? `تم حفظ نتيجتك بنجاح! ${quizType === 'full' ? 'تم فتح الوحدة التالية' : ''}`
            : 'تم حفظ نتيجتك. يمكنك المحاولة مرة أخرى'
        }
      };

    } catch (error) {
      console.error('❌ Error creating unit result:', {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      
      return ctx.internalServerError({
        error: {
          message: 'Failed to save unit result: ' + error.message,
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }
      });
    }
  },

  // ✅ Add custom find method to get user's unit results
  async find(ctx) {
    try {
      const { user } = ctx.query;

      if (!user) {
        return ctx.badRequest('User ID is required');
      }

      // Get user by documentId
      const users = await strapi.db.query('plugin::users-permissions.user').findMany({
        where: { documentId: user },
        limit: 1
      });

      const userProfile = users[0];
      if (!userProfile) {
        return ctx.badRequest('User not found');
      }

      // Find all unit results for this user
      const results = await strapi.db.query('api::unit-result.unit-result').findMany({
        where: {
          user: userProfile.id
        },
        orderBy: { createdAt: 'desc' }
      });

      console.log('📊 Retrieved unit results:', {
        userId: userProfile.id,
        totalResults: results.length
      });

      return {
        data: results,
        meta: {
          total: results.length
        }
      };

    } catch (error) {
      console.error('❌ Error fetching unit results:', error);
      return ctx.internalServerError('Failed to fetch unit results: ' + error.message);
    }
  }
}));
