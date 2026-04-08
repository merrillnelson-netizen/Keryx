package app.keryx.bridge.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query

@Dao
interface PendingRelayDao {

    @Insert
    suspend fun insert(item: PendingRelay): Long

    @Query("SELECT * FROM pending_relay ORDER BY createdAt ASC LIMIT 50")
    suspend fun getAll(): List<PendingRelay>

    @Query("DELETE FROM pending_relay WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("UPDATE pending_relay SET attempts = attempts + 1 WHERE id = :id")
    suspend fun incrementAttempts(id: Long)

    @Query("DELETE FROM pending_relay WHERE attempts >= :maxAttempts")
    suspend fun purgeExhausted(maxAttempts: Int)

    @Query("SELECT COUNT(*) FROM pending_relay")
    suspend fun count(): Int
}
