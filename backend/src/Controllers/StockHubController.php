<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\TableExporter;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use PDO;

/** Combined view of stock across warehouse/branch/employee owners (section 4 "Stock Hub"). */
class StockHubController
{
    public function __construct(private PDO $pdo)
    {
    }

    public function index(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'inventory.view_stock');

        $where = [];
        $params = [];
        if (!empty($_GET['owner_type'])) {
            $where[] = 'sl.owner_type = :owner_type';
            $params['owner_type'] = $_GET['owner_type'];
        }
        // Deliberately NOT falling back to $_GET['branch_id'] here — Stock
        // Hub is a cross-branch combined view by design (see class docblock),
        // and the web app's axios interceptor auto-attaches branch_id to
        // EVERY request for other, branch-scoped endpoints. That fallback
        // used to silently misinterpret the current UI branch as an
        // owner_id filter — for owner_type=employee, owner_id is a user id,
        // not a branch id, so it filtered out real van/salesman stock rows
        // whenever the logged-in branch id didn't happen to match a user
        // id. Only an explicit owner_id (a real caller-chosen filter, never
        // auto-attached by anything) narrows this endpoint.
        $ownerId = $_GET['owner_id'] ?? null;
        if (!empty($ownerId)) {
            $where[] = 'sl.owner_id = :owner_id';
            $params['owner_id'] = (int) $ownerId;
        }
        if (!empty($_GET['item_id'])) {
            $where[] = 'sl.item_id = :item_id';
            $params['item_id'] = (int) $_GET['item_id'];
        }
        if (empty($where)) {
            $stmt = $this->pdo->prepare(
                "SELECT COALESCE(sl.id, 0) AS id, i.id AS item_id,
                        COALESCE(sl.owner_type, 'branch') AS owner_type,
                        COALESCE(sl.owner_id, 1) AS owner_id,
                        COALESCE(sl.quantity_on_hand, 0) AS quantity_on_hand,
                        COALESCE(sl.reserved_quantity, 0) AS reserved_quantity,
                        COALESCE(sl.reorder_level, i.min_stock_threshold, 0) AS reorder_level,
                        i.item_name, i.item_code, i.barcode, i.min_stock_threshold,
                        i.cost_price, i.purchase_price,
                        COALESCE(i.net_srate, i.retail_price) AS selling_price,
                        ROUND(COALESCE(sl.quantity_on_hand, 0) * i.cost_price, 2) AS stock_value,
                        su.short_code AS unit_code,
                        CASE COALESCE(sl.owner_type, 'branch')
                            WHEN 'branch' THEN COALESCE((SELECT branch_name FROM branches WHERE id = COALESCE(sl.owner_id, 1)), 'Main Branch')
                            WHEN 'employee' THEN (SELECT name FROM users WHERE id = sl.owner_id)
                            ELSE 'Warehouse'
                        END AS owner_name,
                        CASE COALESCE(sl.owner_type, 'branch')
                            WHEN 'branch' THEN COALESCE((SELECT branch_name FROM branches WHERE id = COALESCE(sl.owner_id, 1)), 'Main Branch')
                            WHEN 'employee' THEN (SELECT b.branch_name FROM users u JOIN branches b ON b.id = u.branch_id WHERE u.id = sl.owner_id)
                            ELSE NULL
                        END AS branch_name
                 FROM items i
                 LEFT JOIN stock_ledger sl ON sl.item_id = i.id
                 LEFT JOIN stock_units su ON su.id = i.base_unit_id
                 WHERE i.is_active = 1
                 ORDER BY i.item_name"
            );
            $stmt->execute();
        } else {
            $whereSql = 'WHERE ' . implode(' AND ', $where);
            $stmt = $this->pdo->prepare(
                "SELECT sl.*, i.item_name, i.item_code, i.barcode, i.min_stock_threshold,
                        i.cost_price, i.purchase_price,
                        COALESCE(i.net_srate, i.retail_price) AS selling_price,
                        ROUND(sl.quantity_on_hand * i.cost_price, 2) AS stock_value,
                        su.short_code AS unit_code,
                        CASE sl.owner_type
                            WHEN 'branch' THEN (SELECT branch_name FROM branches WHERE id = sl.owner_id)
                            WHEN 'employee' THEN (SELECT name FROM users WHERE id = sl.owner_id)
                            ELSE 'Warehouse'
                        END AS owner_name,
                        CASE sl.owner_type
                            WHEN 'branch' THEN (SELECT branch_name FROM branches WHERE id = sl.owner_id)
                            WHEN 'employee' THEN (SELECT b.branch_name FROM users u JOIN branches b ON b.id = u.branch_id WHERE u.id = sl.owner_id)
                            ELSE NULL
                        END AS branch_name
                 FROM stock_ledger sl
                 JOIN items i ON i.id = sl.item_id
                 LEFT JOIN stock_units su ON su.id = i.base_unit_id
                 {$whereSql}
                 ORDER BY i.item_name"
            );
            $stmt->execute($params);
        }
        $rows = $stmt->fetchAll();

        // Export honors the exact same owner_type/owner_id/item_id filters
        // already applied above — never a full unfiltered dump when the
        // caller asked for a filtered view (section 11's "export only
        // filtered/selected data").
        if (!empty($_GET['export'])) {
            PermissionMiddleware::require($claims, 'reports.export_excel');
            \App\Helpers\TableExporter::export([
                'item_name' => 'Item', 'item_code' => 'SKU', 'barcode' => 'Barcode', 'unit_code' => 'Unit',
                'quantity_on_hand' => 'Quantity', 'cost_price' => 'Purchase/Cost Price', 'selling_price' => 'Selling Price',
                'stock_value' => 'Stock Value', 'owner_type' => 'Owner Type', 'owner_name' => 'Van/Salesman/Owner',
                'branch_name' => 'Branch',
            ], $rows, 'van_salesman_stock.xlsx');
        }

        Response::json($rows);
    }

    /** GET /api/stock-hub/low-stock — items at/under their min_stock_threshold across all branch pools. */
    public function lowStock(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'inventory.view_stock');

        $stmt = $this->pdo->query(
            "SELECT i.id, i.item_code, i.item_name, i.min_stock_threshold,
                    COALESCE(SUM(CASE WHEN sl.owner_type = 'branch' THEN sl.quantity_on_hand ELSE 0 END), 0) AS branch_qty
             FROM items i
             LEFT JOIN stock_ledger sl ON sl.item_id = i.id
             WHERE i.is_active = 1
             GROUP BY i.id, i.item_code, i.item_name, i.min_stock_threshold
             HAVING branch_qty <= i.min_stock_threshold
             ORDER BY i.item_name"
        );
        $rows = $stmt->fetchAll();

        if (!empty($_GET['export'])) {
            PermissionMiddleware::require($claims, 'reports.export_excel');
            TableExporter::export([
                'item_code' => 'Code', 'item_name' => 'Item', 'branch_qty' => 'Qty on Hand', 'min_stock_threshold' => 'Min Threshold',
            ], $rows, 'low_stock.xlsx');
        }

        Response::json($rows);
    }
}
