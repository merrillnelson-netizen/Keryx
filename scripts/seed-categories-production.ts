import { db } from '../server/db';
import { users, categories } from '../shared/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Seeds default categories for all existing users in production
 * Run this script ONCE after deploying the categories feature
 */

const DEFAULT_CATEGORIES = [
  'Billiards',
  'Groceries', 
  'Meeting',
  'General',
  'Health',
  'Financial'
];

async function seedCategoriesForAllUsers() {
  try {
    console.log('🌱 Starting category seeding for all users...');
    
    // Get all users
    const allUsers = await db.select({ id: users.id, username: users.username }).from(users);
    console.log(`Found ${allUsers.length} users`);
    
    let totalCreated = 0;
    let totalSkipped = 0;
    
    for (const user of allUsers) {
      console.log(`\n👤 Processing user: ${user.username}`);
      
      for (const categoryName of DEFAULT_CATEGORIES) {
        // Check if category already exists for this user
        const existing = await db
          .select()
          .from(categories)
          .where(and(
            eq(categories.userId, user.id),
            eq(categories.name, categoryName)
          ))
          .limit(1);
        
        if (existing.length > 0) {
          console.log(`  ⏭️  Skipped "${categoryName}" (already exists)`);
          totalSkipped++;
        } else {
          await db.insert(categories).values({
            userId: user.id,
            name: categoryName
          });
          console.log(`  ✅ Created "${categoryName}"`);
          totalCreated++;
        }
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`  Users processed: ${allUsers.length}`);
    console.log(`  Categories created: ${totalCreated}`);
    console.log(`  Categories skipped: ${totalSkipped}`);
    console.log('\n✅ Category seeding completed successfully!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding categories:', error);
    process.exit(1);
  }
}

seedCategoriesForAllUsers();
