package lib

import com.gu.mediaservice.model.{Agencies, Agency}
import com.gu.mediaservice.model.usage.{DigitalUsage, PrintUsage, PublishedUsageStatus}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatest.time.{Millis, Seconds, Span}
import org.scalatestplus.mockito.MockitoSugar
import org.mockito.Mockito.when

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

class UsageStoreTest extends AnyFunSpec with Matchers with ScalaFutures with MockitoSugar {

  implicit val patience: PatienceConfig = PatienceConfig(timeout = Span(5, Seconds), interval = Span(50, Millis))

  // Use real known agencies from Agencies.all so we can test the full flow.
  // "getty" → Agency("Getty Images"), "rex" → Agency("Rex Features") in Agencies.all.
  val gettyId = "getty"
  val gettyAgency: Agency = Agencies.all(gettyId)
  val rexId = "rex"
  val rexAgency: Agency = Agencies.all(rexId)

  private def makeStore(
    quotaCounts: Map[String, Long],          // agencyId → ES count
    quotaLimits: Map[String, Int] = Map.empty // agencyId → configured quota
  ): UsageStore = {
    val mockQuotaStore = mock[QuotaStore]
    val quotaMap: Map[String, SupplierUsageQuota] = quotaLimits.map { case (id, limit) =>
      id -> SupplierUsageQuota(Agencies.all(id), limit)
    }
    when(mockQuotaStore.getQuota).thenReturn(quotaMap)

    val getSupplierQuotaCount: (String, Int) => Future[SupplierQuotaCount] = (id, _) =>
      Future.successful(SupplierQuotaCount(Agencies.get(id), quotaCounts.getOrElse(id, 0L)))

    new UsageStore(getSupplierQuotaCount, mockQuotaStore)
  }

  private def makeFailingStore(): UsageStore = {
    val mockQuotaStore = mock[QuotaStore]
    when(mockQuotaStore.getQuota).thenReturn(Map.empty[String, SupplierUsageQuota])

    val getSupplierQuotaCount: (String, Int) => Future[SupplierQuotaCount] = (_, _) =>
      Future.failed(new Exception("ElasticSearch is unavailable"))

    new UsageStore(getSupplierQuotaCount, mockQuotaStore)
  }

  private def updateAndGet(store: UsageStore) = {
    store.update()
    // update() is fire-and-forget; give the future a moment to complete
    Thread.sleep(200)
    store.getUsageStatus().futureValue
  }

  describe("UsageStore") {
    describe("getSupplierUsageStatus") {
      it("carries through the usage count and quota unchanged") {
        val quotaCount = SupplierQuotaCount(gettyAgency, 42L)
        val quota = SupplierUsageQuota(gettyAgency, 100)

        val status = UsageStore.getSupplierUsageStatus(quotaCount, Some(quota))

        status.usage shouldBe quotaCount
        status.quota shouldBe Some(quota)
      }

      it("sets exceeded=false when usage is below the quota limit") {
        val quotaCount = SupplierQuotaCount(gettyAgency, 99L)
        val quota = SupplierUsageQuota(gettyAgency, 100)

        val status = UsageStore.getSupplierUsageStatus(quotaCount, Some(quota))

        status.exceeded shouldBe false
      }

      it("sets exceeded=true when usage is above the quota limit") {
        val quotaCount = SupplierQuotaCount(gettyAgency, 101L)
        val quota = SupplierUsageQuota(gettyAgency, 100)

        val status = UsageStore.getSupplierUsageStatus(quotaCount, Some(quota))

        status.exceeded shouldBe true
      }

      it("sets exceeded=true when usage exactly equals the quota limit") {
        // Hitting the quota limit exactly counts as exceeding it
        val quotaCount = SupplierQuotaCount(gettyAgency, 100L)
        val quota = SupplierUsageQuota(gettyAgency, 100)

        val status = UsageStore.getSupplierUsageStatus(quotaCount, Some(quota))

        status.exceeded shouldBe true
      }

      it("calculates fractionOfQuota correctly") {
        val quotaCount = SupplierQuotaCount(gettyAgency, 75L)
        val quota = SupplierUsageQuota(gettyAgency, 100)

        val status = UsageStore.getSupplierUsageStatus(quotaCount, Some(quota))

        status.fractionOfQuota shouldBe 0.75f +- 0.001f
      }

      it("sets fractionOfQuota=0 when no quota limit is configured") {
        val quotaCount = SupplierQuotaCount(gettyAgency, 50L)

        val status = UsageStore.getSupplierUsageStatus(quotaCount, quota = None)

        status.fractionOfQuota shouldBe 0f
      }
    }

    describe("update / getUsageStatus") {
      it("populates the store with quota counts for all known agencies") {
        val store = makeStore(quotaCounts = Map(gettyId -> 42L, rexId -> 17L))
        val status = updateAndGet(store)

        status.store should contain key gettyAgency.supplier
        status.store(gettyAgency.supplier).usage.count shouldBe 42L
        status.store(gettyAgency.supplier).usage.agency shouldBe gettyAgency

        status.store should contain key rexAgency.supplier
        status.store(rexAgency.supplier).usage.count shouldBe 17L
        status.store(rexAgency.supplier).usage.agency shouldBe rexAgency
      }

      it("keeps the previous store contents when a later update fails") {
        var shouldFail = false
        val mockQuotaStore = mock[QuotaStore]
        when(mockQuotaStore.getQuota).thenReturn(Map.empty[String, SupplierUsageQuota])

        val getSupplierQuotaCount: (String, Int) => Future[SupplierQuotaCount] = (id, _) =>
          if (shouldFail) Future.failed(new Exception("ElasticSearch is unavailable"))
          else Future.successful(SupplierQuotaCount(Agencies.get(id), 42L))

        val store = new UsageStore(getSupplierQuotaCount, mockQuotaStore)
        updateAndGet(store) // first update succeeds, populating the store

        shouldFail = true
        store.update() // second update fails
        Thread.sleep(200)

        val status = store.getUsageStatus().futureValue
        status.store(gettyAgency.supplier).usage.count shouldBe 42L
      }

      it("does not advance lastUpdated when an update fails") {
        val store = makeFailingStore()
        val before = store.getUsageStatus().futureValue.lastUpdated

        store.update()
        Thread.sleep(200)

        val after = store.getUsageStatus().futureValue.lastUpdated
        after shouldBe before
      }
    }

    describe("overQuotaAgencies") {
      it("returns agencies whose usage exceeds their quota") {
        val store = makeStore(
          quotaCounts = Map(gettyId -> 150L, rexId -> 50L),
          quotaLimits = Map(gettyId -> 100, rexId -> 100)
        )
        store.update()
        Thread.sleep(200)

        store.overQuotaAgencies should contain(gettyAgency)
        store.overQuotaAgencies should not contain rexAgency
      }

      it("returns an empty list when no agency is over quota") {
        val store = makeStore(
          quotaCounts = Map(gettyId -> 50L),
          quotaLimits = Map(gettyId -> 100)
        )
        store.update()
        Thread.sleep(200)

        store.overQuotaAgencies shouldBe empty
      }
    }

    describe("getUsageStatusForUsageRights") {
      it("returns the status for an Agency image after update") {
        val store = makeStore(
          quotaCounts = Map(gettyId -> 42L),
          quotaLimits = Map(gettyId -> 100)
        )
        store.update()
        Thread.sleep(200)

        val status = store.getUsageStatusForUsageRights(gettyAgency).futureValue
        status.usage.count shouldBe 42L
        status.exceeded shouldBe false
      }

      it("fails with NoUsageQuota for an agency not in the store") {
        val store = makeStore(quotaCounts = Map.empty)
        store.update()
        Thread.sleep(200)

        // Store has no entry for a made-up agency
        val unknownAgency = Agency("Unknown Agency")
        val result = store.getUsageStatusForUsageRights(unknownAgency).failed.futureValue
        result shouldBe a[NoUsageQuota]
      }

      it("fails for non-Agency usage rights") {
        val store = makeStore(quotaCounts = Map.empty)
        val nonAgency = com.gu.mediaservice.model.Handout()
        val result = store.getUsageStatusForUsageRights(nonAgency).failed.futureValue
        result.getMessage should include("Agency")
      }
    }
  }
}
