<?php

declare(strict_types=1);

namespace App\Models;

use App\Helpers\CodeGenerator;
use PDO;

class ItemModel
{
    /** Columns a caller may write directly on the items row. */
    private const WRITABLE_COLUMNS = [
        'item_name', 'category_id', 'brand_id', 'product_line_id', 'supplier_id', 'hsn_code', 'barcode',
        'base_unit_id', 'secondary_unit_id', 'conversion_factor', 'purchase_price', 'cost_price',
        'wholesale_price', 'retail_price', 'mrp', 'net_srate', 'net_purrate',
        'secondary_mrp', 'secondary_net_srate', 'secondary_net_purrate',
        'retail_selling_price', 'wholesale_selling_price',
        'min_stock_threshold', 'tax_code_id', 'image', 'is_active',
    ];

    /**
     * Resolves the effective MRP/sale-rate/purchase-rate for a given unit
     * on an item — NET_SRATE/NET_PURRATE are independent fields (never
     * derived from MRP or from each other, section 21), and the
     * secondary-unit variant is used only when the sale/purchase is
     * actually happening in that unit (section 17). Falls back to the
     * legacy retail_price/purchase_price columns explicitly (never
     * silently) when NET_SRATE/NET_PURRATE aren't set on an older item
     * (section 19).
     */
    public static function resolveUnitPricing(array $item, ?int $unitId): array
    {
        $isSecondary = $unitId !== null
            && !empty($item['secondary_unit_id'])
            && (int) $unitId === (int) $item['secondary_unit_id'];

        if ($isSecondary) {
            return [
                'mrp' => $item['secondary_mrp'] !== null && $item['secondary_mrp'] !== '' ? (float) $item['secondary_mrp'] : (float) $item['mrp'],
                'net_srate' => $item['secondary_net_srate'] !== null && $item['secondary_net_srate'] !== ''
                    ? (float) $item['secondary_net_srate']
                    : (float) ($item['net_srate'] ?? $item['retail_price']),
                'net_purrate' => $item['secondary_net_purrate'] !== null && $item['secondary_net_purrate'] !== ''
                    ? (float) $item['secondary_net_purrate']
                    : (float) ($item['net_purrate'] ?? $item['purchase_price']),
            ];
        }

        return [
            'mrp' => (float) $item['mrp'],
            'net_srate' => (float) ($item['net_srate'] ?? $item['retail_price']),
            'net_purrate' => (float) ($item['net_purrate'] ?? $item['purchase_price']),
        ];
    }

    /**
     * Central billing price resolver (Phase 14) — the ONLY place that
     * decides which selling price a cart line uses. `retail_selling_price`/
     * `wholesale_selling_price` are a flat, unit-agnostic override on top of
     * whatever resolveUnitPricing() already resolved for the unit actually
     * being sold (so a secondary-unit line still gets its own S-NET_SRATE
     * when Retail/Wholesale isn't configured, exactly like Normal mode) —
     * this project has no per-unit Retail/Wholesale price, by design (one
     * flat Retail/Wholesale price per item, same as the test data).
     *
     * NEVER falls back to MRP or NET_PURRATE — an unconfigured Retail/
     * Wholesale price falls back only to that unit's own NET_SRATE, and the
     * `configured` flag tells the caller whether that fallback happened, so
     * the UI can say so instead of silently pretending the item has a
     * configured Retail/Wholesale price when it doesn't.
     */
    public static function resolveSellingPrice(array $item, ?int $unitId, string $priceType = 'normal'): array
    {
        $unitPricing = self::resolveUnitPricing($item, $unitId);

        if ($priceType === 'wholesale' || $priceType === 'retail') {
            $column = $priceType === 'wholesale' ? 'wholesale_selling_price' : 'retail_selling_price';
            $configured = isset($item[$column]) && $item[$column] !== null && $item[$column] !== '';
            return [
                'rate' => $configured ? (float) $item[$column] : $unitPricing['net_srate'],
                'mrp' => $unitPricing['mrp'],
                'configured' => $configured,
            ];
        }

        return ['rate' => $unitPricing['net_srate'], 'mrp' => $unitPricing['mrp'], 'configured' => true];
    }

    public function __construct(private PDO $pdo)
    {
    }

    private const LIST_SELECT = "
        SELECT i.*,
               (SELECT COALESCE(SUM(sm.qty_change), 0) FROM stock_movements sm WHERE sm.item_id = i.id AND sm.movement_type = 'opening_stock') AS opening_stock,
               c.name AS category_name, b.name AS brand_name, pl.name AS product_line_name,
               s.name AS supplier_name,
               bu.short_code AS base_unit_code, su.short_code AS secondary_unit_code,
               tc.code AS tax_code, tc.gst_percent, tc.cess_percent
        FROM items i
        LEFT JOIN categories c ON c.id = i.category_id
        LEFT JOIN brands b ON b.id = i.brand_id
        LEFT JOIN product_lines pl ON pl.id = i.product_line_id
        LEFT JOIN suppliers s ON s.id = i.supplier_id
        LEFT JOIN stock_units bu ON bu.id = i.base_unit_id
        LEFT JOIN stock_units su ON su.id = i.secondary_unit_id
        LEFT JOIN tax_codes tc ON tc.id = i.tax_code_id
    ";

    /**
     * @param int|null $branchId when given, only items mapped to that
     * branch are returned — this is what makes item_branches a real
     * availability filter rather than a decorative field (section 6).
     * @param string $status 'active' (default — every normal caller,
     * including Billing/POS, gets only sellable items), 'inactive' (the
     * Items screen's "Deactivated" filter), or 'all' (the Items screen's
     * combined view). Billing/product-search call sites simply never pass
     * anything other than the default, so a deactivated item can never
     * reach the POS product list or search results.
     */
    public function all(?string $search = null, ?int $branchId = null, string $status = 'active'): array
    {
        $sql = self::LIST_SELECT;
        $joins = [];
        $where = [];
        $params = [];

        if ($status === 'active') {
            $where[] = 'i.is_active = 1';
        } elseif ($status === 'inactive') {
            $where[] = 'i.is_active = 0';
        }
        // 'all' — no is_active filter.

        if ($branchId !== null) {
            $joins[] = 'LEFT JOIN item_branches ib ON ib.item_id = i.id AND ib.branch_id = :branch_id_join';
            $where[] = '(ib.branch_id = :branch_id_where OR NOT EXISTS (SELECT 1 FROM item_branches ib2 WHERE ib2.item_id = i.id))';
            $params['branch_id_join'] = $branchId;
            $params['branch_id_where'] = $branchId;
        }
        if ($search !== null && $search !== '') {
            // Three distinct placeholders, not one reused three times — PDO
            // with emulated prepares off rejects a repeated named parameter
            // ("Invalid parameter number").
            $where[] = '(i.item_name LIKE :search_name OR i.item_code LIKE :search_code OR i.barcode LIKE :search_barcode)';
            $params['search_name'] = "%$search%";
            $params['search_code'] = "%$search%";
            $params['search_barcode'] = "%$search%";
        }

        if ($joins) {
            $sql .= ' ' . implode(' ', $joins);
        }
        if ($where) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY i.item_name';

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function paginate(?string $search = null, ?int $branchId = null, string $status = 'active', int $page = 1, int $limit = 10): array
    {
        $page = max(1, $page);
        $limit = max(1, min(100, $limit));
        $offset = ($page - 1) * $limit;

        $joins = [];
        $where = [];
        $params = [];

        if ($status === 'active') {
            $where[] = 'i.is_active = 1';
        } elseif ($status === 'inactive') {
            $where[] = 'i.is_active = 0';
        }

        if ($branchId !== null) {
            $joins[] = 'LEFT JOIN item_branches ib ON ib.item_id = i.id AND ib.branch_id = :branch_id_join';
            $where[] = '(ib.branch_id = :branch_id_where OR NOT EXISTS (SELECT 1 FROM item_branches ib2 WHERE ib2.item_id = i.id))';
            $params['branch_id_join'] = $branchId;
            $params['branch_id_where'] = $branchId;
        }
        if ($search !== null && $search !== '') {
            $where[] = '(i.item_name LIKE :search_name OR i.item_code LIKE :search_code OR i.barcode LIKE :search_barcode)';
            $params['search_name'] = "%$search%";
            $params['search_code'] = "%$search%";
            $params['search_barcode'] = "%$search%";
        }

        $joinSql = $joins ? (' ' . implode(' ', $joins)) : '';
        $whereSql = $where ? (' WHERE ' . implode(' AND ', $where)) : '';

        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM items i{$joinSql}{$whereSql}");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $sql = self::LIST_SELECT . "{$joinSql}{$whereSql} ORDER BY i.item_name LIMIT :limit OFFSET :offset";
        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll();

        return [
            'data' => $rows,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'total_pages' => (int) ceil($total / $limit),
        ];
    }


    public function find(int $id): ?array
    {
        $stmt = $this->pdo->prepare(self::LIST_SELECT . ' WHERE i.id = :id');
        $stmt->execute(['id' => $id]);
        $item = $stmt->fetch();

        if (!$item) {
            return null;
        }

        $stmt = $this->pdo->prepare(
            'SELECT iuc.*, su.short_code, su.name AS unit_name
             FROM item_unit_conversions iuc
             JOIN stock_units su ON su.id = iuc.unit_id
             WHERE iuc.item_id = :item_id'
        );
        $stmt->execute(['item_id' => $id]);
        $item['unit_conversions'] = $stmt->fetchAll();

        $item['branch_ids'] = $this->branchIdsFor($id);

        return $item;
    }

    public function branchIdsFor(int $itemId): array
    {
        $stmt = $this->pdo->prepare('SELECT branch_id FROM item_branches WHERE item_id = :item_id');
        $stmt->execute(['item_id' => $itemId]);
        return array_map('intval', array_column($stmt->fetchAll(), 'branch_id'));
    }

    public function findByCode(string $itemCode): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM items WHERE item_code = :code LIMIT 1');
        $stmt->execute(['code' => $itemCode]);
        return $stmt->fetch() ?: null;
    }

    /**
     * Creates an item + its optional unit conversions + branch mapping in
     * one transaction, then assigns item_code from the new row's own id
     * (ITM00001 style). $branchIds defaults to "every existing branch"
     * when omitted so a plain create (e.g. via import) doesn't silently
     * create an item nobody can sell anywhere.
     */
    /** Blank string isn't "no barcode" to a UNIQUE index the way NULL is — every blank would collide. */
    private function normalizeBarcode(array $data): array
    {
        if (array_key_exists('barcode', $data) && trim((string) $data['barcode']) === '') {
            $data['barcode'] = null;
        }
        return $data;
    }

    public function create(array $data, array $unitConversions = [], ?array $branchIds = null): int
    {
        $data = $this->normalizeBarcode($data);
        $this->pdo->beginTransaction();
        try {
            $columns = array_intersect_key($data, array_flip(self::WRITABLE_COLUMNS));
            $cols = array_keys($columns);
            $placeholders = array_map(fn ($c) => ":$c", $cols);

            $stmt = $this->pdo->prepare(
                'INSERT INTO items (' . implode(',', $cols) . ')
                 VALUES (' . implode(',', $placeholders) . ')'
            );
            $stmt->execute($columns);
            $id = (int) $this->pdo->lastInsertId();

            $this->pdo->prepare('UPDATE items SET item_code = :code WHERE id = :id')
                ->execute(['code' => CodeGenerator::fromId('ITM', $id), 'id' => $id]);

            $this->saveUnitConversions($id, $unitConversions);
            $this->saveBranchMapping($id, $branchIds);

            $this->pdo->commit();
            return $id;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function update(int $id, array $data, ?array $unitConversions = null, ?array $branchIds = null): void
    {
        $data = $this->normalizeBarcode($data);
        $this->pdo->beginTransaction();
        try {
            $columns = array_intersect_key($data, array_flip(self::WRITABLE_COLUMNS));
            if (!empty($columns)) {
                $set = implode(',', array_map(fn ($c) => "$c = :$c", array_keys($columns)));
                $stmt = $this->pdo->prepare("UPDATE items SET {$set} WHERE id = :id");
                $stmt->execute([...$columns, 'id' => $id]);
            }

            if ($unitConversions !== null) {
                $this->pdo->prepare('DELETE FROM item_unit_conversions WHERE item_id = :item_id')
                    ->execute(['item_id' => $id]);
                $this->saveUnitConversions($id, $unitConversions);
            }

            if ($branchIds !== null) {
                $this->pdo->prepare('DELETE FROM item_branches WHERE item_id = :item_id')
                    ->execute(['item_id' => $id]);
                $this->saveBranchMapping($id, $branchIds);
            }

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /**
     * "Delete" from the item screen is always a deactivation, never a
     * physical DELETE — an item can be referenced by years of invoices,
     * purchases, stock movements, and reports, and hard-deleting it would
     * either break those foreign keys or silently corrupt historical
     * documents. Reactivation is just the normal update() call with
     * is_active:1 — there's no separate "undelete" path to keep in sync.
     */
    public function delete(int $id): array
    {
        $this->pdo->prepare('UPDATE items SET is_active = 0 WHERE id = :id')->execute(['id' => $id]);
        return ['deleted' => true, 'deactivated' => true, 'message' => 'Item deactivated. It will no longer appear in Billing or the active Items list, and remains available for existing invoices/reports.'];
    }

    private function saveUnitConversions(int $itemId, array $unitConversions): void
    {
        if (empty($unitConversions)) {
            return;
        }

        $stmt = $this->pdo->prepare(
            'INSERT INTO item_unit_conversions (item_id, unit_id, conversion_to_base, is_purchase_unit, is_sale_unit)
             VALUES (:item_id, :unit_id, :conversion_to_base, :is_purchase_unit, :is_sale_unit)'
        );

        foreach ($unitConversions as $uc) {
            if (empty($uc['unit_id']) || !isset($uc['conversion_to_base'])) {
                continue;
            }
            $stmt->execute([
                'item_id' => $itemId,
                'unit_id' => (int) $uc['unit_id'],
                'conversion_to_base' => (float) $uc['conversion_to_base'],
                'is_purchase_unit' => !empty($uc['is_purchase_unit']) ? 1 : 0,
                'is_sale_unit' => !empty($uc['is_sale_unit']) ? 1 : 0,
            ]);
        }
    }

    private function saveBranchMapping(int $itemId, ?array $branchIds): void
    {
        if ($branchIds === null) {
            // No explicit selection — default to every existing branch so
            // a plain create (import, quick-add) is sellable everywhere,
            // matching pre-Phase-8 behavior, until someone narrows it.
            $branchIds = array_column($this->pdo->query('SELECT id FROM branches')->fetchAll(), 'id');
        }
        if (empty($branchIds)) {
            return;
        }

        $stmt = $this->pdo->prepare('INSERT IGNORE INTO item_branches (item_id, branch_id) VALUES (:item_id, :branch_id)');
        foreach (array_unique(array_map('intval', $branchIds)) as $branchId) {
            $stmt->execute(['item_id' => $itemId, 'branch_id' => $branchId]);
        }
    }
}
