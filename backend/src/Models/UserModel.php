<?php

declare(strict_types=1);

namespace App\Models;

use PDO;

class UserModel
{
    public function __construct(private PDO $pdo)
    {
    }

    public function findByEmail(string $email): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT u.*, r.name AS role_name
             FROM users u
             JOIN roles r ON r.id = u.role_id
             WHERE u.email = :email
             LIMIT 1'
        );
        $stmt->execute(['email' => $email]);
        $user = $stmt->fetch();

        return $user ?: null;
    }

    public function findById(int $id): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT u.*, r.name AS role_name
             FROM users u
             JOIN roles r ON r.id = u.role_id
             WHERE u.id = :id
             LIMIT 1'
        );
        $stmt->execute(['id' => $id]);
        $user = $stmt->fetch();

        return $user ?: null;
    }

    /**
     * Effective permission codes for a user = role_permissions for their role,
     * overridden by any row in user_permissions for that exact user
     * (is_granted=1 forces allow, is_granted=0 forces deny even if the role grants it).
     *
     * @return string[]
     */
    public function getEffectivePermissionCodes(int $userId, int $roleId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT p.code
             FROM role_permissions rp
             JOIN permissions p ON p.id = rp.permission_id
             WHERE rp.role_id = :role_id'
        );
        $stmt->execute(['role_id' => $roleId]);
        $codes = array_column($stmt->fetchAll(), 'code');
        $granted = array_fill_keys($codes, true);

        $stmt = $this->pdo->prepare(
            'SELECT p.code, up.is_granted
             FROM user_permissions up
             JOIN permissions p ON p.id = up.permission_id
             WHERE up.user_id = :user_id'
        );
        $stmt->execute(['user_id' => $userId]);

        foreach ($stmt->fetchAll() as $override) {
            if ((int) $override['is_granted'] === 1) {
                $granted[$override['code']] = true;
            } else {
                unset($granted[$override['code']]);
            }
        }

        return array_keys($granted);
    }

    /** All staff accounts, optionally scoped to one branch (Super Admin can see every branch). */
    public function all(?int $branchId = null): array
    {
        $sql = "SELECT u.id, u.name, u.email, u.phone, u.status, u.branch_id, u.role_id,
                       u.created_at, r.name AS role_name, b.branch_name
                FROM users u
                JOIN roles r ON r.id = u.role_id
                LEFT JOIN branches b ON b.id = u.branch_id";
        $params = [];
        if ($branchId !== null) {
            $sql .= ' WHERE u.branch_id = :branch_id';
            $params['branch_id'] = $branchId;
        }
        $sql .= ' ORDER BY u.name';

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function create(array $data): int
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO users (branch_id, role_id, name, email, password_hash, phone, status)
             VALUES (:branch_id, :role_id, :name, :email, :password_hash, :phone, :status)'
        );
        $stmt->execute([
            'branch_id' => $data['branch_id'] ?? null,
            'role_id' => $data['role_id'],
            'name' => $data['name'],
            'email' => $data['email'],
            'password_hash' => password_hash($data['password'], PASSWORD_BCRYPT),
            'phone' => $data['phone'] ?? null,
            'status' => $data['status'] ?? 'active',
        ]);
        return (int) $this->pdo->lastInsertId();
    }

    public function update(int $id, array $data): void
    {
        $columns = ['branch_id', 'role_id', 'name', 'email', 'phone', 'status'];
        $set = [];
        $params = ['id' => $id];
        foreach ($columns as $col) {
            if (array_key_exists($col, $data)) {
                $set[] = "$col = :$col";
                $params[$col] = $data[$col];
            }
        }
        if (!empty($data['password'])) {
            $set[] = 'password_hash = :password_hash';
            $params['password_hash'] = password_hash($data['password'], PASSWORD_BCRYPT);
        }
        if (empty($set)) {
            return;
        }
        $stmt = $this->pdo->prepare('UPDATE users SET ' . implode(', ', $set) . ' WHERE id = :id');
        $stmt->execute($params);
    }

    /**
     * Every permission code with: does the role grant it by default, is
     * there an override for this user, and what's the effective result.
     * Feeds the Staff & Permissions toggle screen (section 2.3/2.4).
     */
    public function permissionBreakdown(int $userId, int $roleId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT p.id, p.module, p.code, p.label,
                    (rp.permission_id IS NOT NULL) AS role_grants,
                    up.is_granted AS override
             FROM permissions p
             LEFT JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role_id = :role_id
             LEFT JOIN user_permissions up ON up.permission_id = p.id AND up.user_id = :user_id
             ORDER BY p.module, p.code'
        );
        $stmt->execute(['role_id' => $roleId, 'user_id' => $userId]);
        $rows = $stmt->fetchAll();

        foreach ($rows as &$row) {
            $roleGrants = (bool) $row['role_grants'];
            $override = $row['override'];
            $row['role_grants'] = $roleGrants;
            $row['override'] = $override === null ? null : (bool) $override;
            $row['effective'] = $override === null ? $roleGrants : (bool) $override;
        }

        return $rows;
    }

    /**
     * Merges the given overrides into this user's existing set — touches
     * only the permission_ids present in $overrides, leaving every other
     * previously-set override alone. is_granted:null clears that one
     * override (back to "follow the role"); true/false sets it. The
     * frontend only ever sends the permissions actually changed in this
     * session, so a full-replace here would silently wipe out unrelated
     * overrides set in an earlier session — merge, never replace-all.
     */
    public function setPermissionOverrides(int $userId, array $overrides, int $grantedBy): void
    {
        $this->pdo->beginTransaction();
        try {
            $upsert = $this->pdo->prepare(
                'INSERT INTO user_permissions (user_id, permission_id, is_granted, granted_by)
                 VALUES (:user_id, :permission_id, :is_granted, :granted_by)
                 ON DUPLICATE KEY UPDATE is_granted = VALUES(is_granted), granted_by = VALUES(granted_by)'
            );
            $clear = $this->pdo->prepare(
                'DELETE FROM user_permissions WHERE user_id = :user_id AND permission_id = :permission_id'
            );

            foreach ($overrides as $o) {
                $permissionId = (int) $o['permission_id'];
                if ($o['is_granted'] === null) {
                    $clear->execute(['user_id' => $userId, 'permission_id' => $permissionId]);
                    continue;
                }
                $upsert->execute([
                    'user_id' => $userId,
                    'permission_id' => $permissionId,
                    'is_granted' => $o['is_granted'] ? 1 : 0,
                    'granted_by' => $grantedBy,
                ]);
            }

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function logLogin(?int $userId, string $emailAttempted, bool $success): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO login_log (user_id, email_attempted, ip_address, user_agent, success)
             VALUES (:user_id, :email, :ip, :ua, :success)'
        );
        $stmt->execute([
            'user_id' => $userId,
            'email' => $emailAttempted,
            'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
            'ua' => $_SERVER['HTTP_USER_AGENT'] ?? null,
            'success' => $success ? 1 : 0,
        ]);
    }
}
