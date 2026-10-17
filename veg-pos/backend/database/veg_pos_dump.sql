-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: veg_pos
-- ------------------------------------------------------
-- Server version	5.7.44-log

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `veg_pos`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `veg_pos` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;

USE `veg_pos`;

--
-- Table structure for table `audit_log`
--

DROP TABLE IF EXISTS `audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `audit_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `username` varchar(50) DEFAULT NULL,
  `action` varchar(30) NOT NULL,
  `entity_type` varchar(30) NOT NULL,
  `entity_id` int(11) DEFAULT NULL,
  `details` longtext,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_entity` (`entity_type`,`entity_id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_log`
--

LOCK TABLES `audit_log` WRITE;
/*!40000 ALTER TABLE `audit_log` DISABLE KEYS */;
INSERT INTO `audit_log` VALUES (1,1,'admin','create','bill',1,'{\"bill_no\":\"L-0001\"}','2026-10-17 11:47:31'),(2,1,'admin','create','bill',2,'{\"bill_no\":\"L-0002\"}','2026-10-17 11:50:49'),(3,1,'admin','create','bill',3,'{\"bill_no\":\"LC-0001\"}','2026-10-17 11:52:59'),(4,1,'admin','create','bill',4,'{\"bill_no\":\"L-0003\"}','2026-10-17 12:09:07'),(5,1,'admin','create','bill',5,'{\"bill_no\":\"L-0004\"}','2026-10-17 12:10:08'),(6,1,'admin','create','bill',6,'{\"bill_no\":\"L-0005\"}','2026-10-17 12:32:01'),(7,1,'admin','create','bill',7,'{\"bill_no\":\"L-0006\"}','2026-10-17 12:32:04'),(8,1,'admin','create','bill',8,'{\"bill_no\":\"LC-0002\"}','2026-10-17 12:35:19'),(9,1,'admin','create','bill',9,'{\"bill_no\":\"LC-0003\"}','2026-10-17 12:35:46'),(10,1,'admin','create','bill',10,'{\"bill_no\":\"LC-0004\"}','2026-10-17 12:37:19'),(11,1,'admin','create','bill',11,'{\"bill_no\":\"LC-0005\"}','2026-10-17 12:37:51'),(12,1,'admin','create','bill',12,'{\"bill_no\":\"LC-0006\"}','2026-10-17 12:43:56'),(13,1,'admin','create','bill',13,'{\"bill_no\":\"LC-0007\"}','2026-10-17 12:47:37'),(14,1,'admin','create','bill',14,'{\"bill_no\":\"LC-0008\"}','2026-10-17 12:50:44'),(15,1,'admin','create','bill',15,'{\"bill_no\":\"LC-0009\"}','2026-10-17 12:51:31'),(16,1,'admin','create','bill',16,'{\"bill_no\":\"LC-0010\"}','2026-10-17 13:00:09');
/*!40000 ALTER TABLE `audit_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bill_lines`
--

DROP TABLE IF EXISTS `bill_lines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `bill_lines` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bill_id` int(11) NOT NULL,
  `item_id` int(11) DEFAULT NULL,
  `item_name_ta` varchar(100) NOT NULL,
  `item_name_en` varchar(100) NOT NULL,
  `unit` varchar(20) NOT NULL DEFAULT 'kg',
  `is_charge_item` tinyint(1) NOT NULL DEFAULT '0',
  `rate` decimal(10,2) NOT NULL DEFAULT '0.00',
  `nos` decimal(10,2) NOT NULL DEFAULT '0.00',
  `weight` decimal(10,2) NOT NULL DEFAULT '0.00',
  `amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `line_order` int(11) NOT NULL DEFAULT '0',
  `bag_count` int(11) DEFAULT NULL,
  `bag_weights` text,
  PRIMARY KEY (`id`),
  KEY `bill_id` (`bill_id`),
  KEY `item_id` (`item_id`),
  CONSTRAINT `bill_lines_ibfk_1` FOREIGN KEY (`bill_id`) REFERENCES `bills` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bill_lines_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bill_lines`
--

LOCK TABLES `bill_lines` WRITE;
/*!40000 ALTER TABLE `bill_lines` DISABLE KEYS */;
INSERT INTO `bill_lines` VALUES (1,1,6,'பூசணிக்காய்','Pumpkin','kg',0,18.00,3.00,113.00,2034.00,0,3,'[34,34,45]'),(2,2,1,'மிளகாய்','Chilli','kg',0,40.00,2.00,28.00,1120.00,0,2,'[12,16]'),(3,3,1,'மிளகாய்','Chilli','kg',0,40.00,2.00,20.00,800.00,0,2,'[10,10]'),(4,4,17,'தடியங்காய்','Ash Gourd','kg',0,18.00,0.00,1.00,18.00,0,NULL,NULL),(5,5,17,'தடியங்காய்','Ash Gourd','kg',0,18.00,0.00,1.00,18.00,0,NULL,NULL),(6,6,1,'மிளகாய்','Chilli','kg',0,40.00,1.00,1.00,40.00,0,1,'[1]'),(7,7,1,'மிளகாய்','Chilli','kg',0,40.00,0.00,1.00,40.00,0,NULL,NULL),(8,8,1,'மிளகாய்','Chilli','kg',0,40.00,1.00,1.00,40.00,0,1,'[1]'),(9,9,1,'மிளகாய்','Chilli','kg',0,40.00,1.00,1.00,40.00,0,1,'[1]'),(10,10,1,'மிளகாய்','Chilli','kg',0,40.00,2.00,5.00,200.00,0,2,'[2,3]'),(11,11,1,'மிளகாய்','Chilli','kg',0,40.00,0.00,1.00,40.00,0,NULL,NULL),(12,12,1,'மிளகாய்','Chilli','kg',0,40.00,1.00,1.00,40.00,0,1,'[1]'),(13,13,1,'மிளகாய்','Chilli','kg',0,40.00,1.00,1.00,40.00,0,1,'[1]'),(14,14,1,'மிளகாய்','Chilli','kg',0,40.00,0.00,1.00,40.00,0,NULL,NULL),(15,15,1,'மிளகாய்','Chilli','kg',0,40.00,0.00,1.00,40.00,0,NULL,NULL),(16,16,1,'மிளகாய்','Chilli','kg',0,40.00,1.00,1.00,40.00,0,1,NULL);
/*!40000 ALTER TABLE `bill_lines` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bill_sequences`
--

DROP TABLE IF EXISTS `bill_sequences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `bill_sequences` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `series_key` varchar(30) NOT NULL,
  `prefix` varchar(10) NOT NULL,
  `next_number` int(11) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `series_key` (`series_key`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bill_sequences`
--

LOCK TABLES `bill_sequences` WRITE;
/*!40000 ALTER TABLE `bill_sequences` DISABLE KEYS */;
INSERT INTO `bill_sequences` VALUES (1,'LOCAL-NORMAL','L-',7),(2,'DISTANT-NORMAL','D-',1),(3,'LOCAL-COMMISSION','LC-',11),(4,'DISTANT-COMMISSION','DC-',1),(5,'QUICK','QS-',1);
/*!40000 ALTER TABLE `bill_sequences` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bills`
--

DROP TABLE IF EXISTS `bills`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `bills` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bill_no` varchar(20) NOT NULL,
  `series_key` varchar(30) NOT NULL,
  `location_type` enum('local','distant') NOT NULL DEFAULT 'local',
  `bill_type` enum('normal','commission','quick') NOT NULL DEFAULT 'normal',
  `party_id` int(11) DEFAULT NULL,
  `walkin_name` varchar(150) DEFAULT NULL,
  `bill_date` date NOT NULL,
  `items_total` decimal(12,2) NOT NULL DEFAULT '0.00',
  `discount_percent` decimal(5,2) DEFAULT NULL,
  `discount_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `previous_balance` decimal(12,2) NOT NULL DEFAULT '0.00',
  `commission_percent` decimal(5,2) DEFAULT NULL,
  `commission_mode` enum('percentage','fixed') NOT NULL DEFAULT 'percentage',
  `commission_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `patthu_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `cooli_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `vadagai_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `other_deduction_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `total_deductions` decimal(12,2) NOT NULL DEFAULT '0.00',
  `grand_total` decimal(12,2) NOT NULL DEFAULT '0.00',
  `paid_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `payment_method_id` int(11) DEFAULT NULL,
  `balance_due` decimal(12,2) NOT NULL DEFAULT '0.00',
  `status` enum('active','cancelled') NOT NULL DEFAULT 'active',
  `notes` varchar(255) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bill_series_no` (`series_key`,`bill_no`),
  KEY `payment_method_id` (`payment_method_id`),
  KEY `idx_bills_date` (`bill_date`),
  KEY `idx_bills_party` (`party_id`),
  CONSTRAINT `bills_ibfk_1` FOREIGN KEY (`party_id`) REFERENCES `parties` (`id`),
  CONSTRAINT `bills_ibfk_2` FOREIGN KEY (`payment_method_id`) REFERENCES `payment_methods` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bills`
--

LOCK TABLES `bills` WRITE;
/*!40000 ALTER TABLE `bills` DISABLE KEYS */;
INSERT INTO `bills` VALUES (1,'L-0001','LOCAL-NORMAL','local','normal',NULL,NULL,'2026-10-17',2034.00,NULL,0.00,0.00,NULL,'percentage',0.00,0.00,0.00,0.00,0.00,0.00,2034.00,2034.00,2,0.00,'active',NULL,1,1,'2026-10-17 11:47:31','2026-10-17 11:47:31'),(2,'L-0002','LOCAL-NORMAL','local','normal',NULL,NULL,'2026-10-17',1120.00,NULL,0.00,0.00,NULL,'percentage',0.00,0.00,0.00,0.00,0.00,0.00,1120.00,1120.00,2,0.00,'active',NULL,1,1,'2026-10-17 11:50:49','2026-10-17 11:50:49'),(3,'LC-0001','LOCAL-COMMISSION','local','commission',NULL,NULL,'2026-10-17',800.00,NULL,0.00,0.00,10.00,'percentage',80.00,10.00,10.00,10.00,10.00,120.00,680.00,680.00,2,0.00,'active',NULL,1,1,'2026-10-17 11:52:59','2026-10-17 11:52:59'),(4,'L-0003','LOCAL-NORMAL','local','normal',NULL,NULL,'2026-10-17',18.00,NULL,0.00,0.00,NULL,'percentage',0.00,0.00,0.00,0.00,0.00,0.00,18.00,0.00,1,18.00,'active',NULL,1,1,'2026-10-17 12:09:07','2026-10-17 12:09:07'),(5,'L-0004','LOCAL-NORMAL','local','normal',NULL,NULL,'2026-10-17',18.00,NULL,0.00,0.00,NULL,'percentage',0.00,0.00,0.00,0.00,0.00,0.00,18.00,0.00,1,18.00,'active',NULL,1,1,'2026-10-17 12:10:08','2026-10-17 12:10:08'),(6,'L-0005','LOCAL-NORMAL','local','normal',NULL,NULL,'2026-10-17',40.00,NULL,0.00,0.00,NULL,'percentage',0.00,0.00,0.00,0.00,0.00,0.00,40.00,0.00,1,40.00,'active',NULL,1,1,'2026-10-17 12:32:01','2026-10-17 12:32:01'),(7,'L-0006','LOCAL-NORMAL','local','normal',NULL,NULL,'2026-10-17',40.00,NULL,0.00,0.00,NULL,'percentage',0.00,0.00,0.00,0.00,0.00,0.00,40.00,0.00,1,40.00,'active',NULL,1,1,'2026-10-17 12:32:04','2026-10-17 12:32:04'),(8,'LC-0002','LOCAL-COMMISSION','local','commission',NULL,NULL,'2026-10-17',40.00,NULL,0.00,0.00,10.00,'percentage',4.00,0.00,0.00,0.00,0.00,4.00,36.00,0.00,1,36.00,'active',NULL,1,1,'2026-10-17 12:35:19','2026-10-17 12:35:19'),(9,'LC-0003','LOCAL-COMMISSION','local','commission',NULL,NULL,'2026-10-17',40.00,NULL,0.00,0.00,10.00,'percentage',4.00,0.00,0.00,0.00,0.00,4.00,36.00,0.00,1,36.00,'active',NULL,1,1,'2026-10-17 12:35:46','2026-10-17 12:35:46'),(10,'LC-0004','LOCAL-COMMISSION','local','commission',NULL,NULL,'2026-10-17',200.00,NULL,0.00,0.00,10.00,'percentage',20.00,8.00,20.00,8.00,9.00,65.00,135.00,0.00,1,135.00,'active',NULL,1,1,'2026-10-17 12:37:19','2026-10-17 12:37:19'),(11,'LC-0005','LOCAL-COMMISSION','local','commission',NULL,NULL,'2026-10-17',40.00,NULL,0.00,0.00,10.00,'percentage',4.00,0.00,0.00,0.00,0.00,4.00,36.00,36.00,2,0.00,'active',NULL,1,1,'2026-10-17 12:37:51','2026-10-17 12:37:51'),(12,'LC-0006','LOCAL-COMMISSION','local','commission',NULL,NULL,'2026-10-17',40.00,NULL,0.00,0.00,10.00,'percentage',4.00,7.00,8.00,8.00,0.00,27.00,13.00,0.00,1,13.00,'active',NULL,1,1,'2026-10-17 12:43:56','2026-10-17 12:43:56'),(13,'LC-0007','LOCAL-COMMISSION','local','commission',NULL,NULL,'2026-10-17',40.00,NULL,0.00,0.00,10.00,'percentage',4.00,2.00,22.00,3.00,2.00,33.00,7.00,0.00,1,7.00,'active',NULL,1,1,'2026-10-17 12:47:37','2026-10-17 12:47:37'),(14,'LC-0008','LOCAL-COMMISSION','local','commission',NULL,NULL,'2026-10-17',40.00,NULL,0.00,0.00,10.00,'percentage',4.00,21.00,1.00,1.00,1.00,28.00,12.00,12.00,2,0.00,'active',NULL,1,1,'2026-10-17 12:50:44','2026-10-17 12:50:44'),(15,'LC-0009','LOCAL-COMMISSION','local','commission',NULL,NULL,'2026-10-17',40.00,NULL,0.00,0.00,10.00,'percentage',4.00,0.00,0.00,0.00,0.00,4.00,36.00,36.00,2,0.00,'active',NULL,1,1,'2026-10-17 12:51:31','2026-10-17 12:51:31'),(16,'LC-0010','LOCAL-COMMISSION','local','commission',NULL,NULL,'2026-10-17',40.00,NULL,0.00,0.00,10.00,'percentage',4.00,0.00,0.00,0.00,0.00,4.00,36.00,36.00,2,0.00,'active',NULL,1,1,'2026-10-17 13:00:09','2026-10-17 13:00:09');
/*!40000 ALTER TABLE `bills` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `held_bills`
--

DROP TABLE IF EXISTS `held_bills`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `held_bills` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `label` varchar(100) DEFAULT NULL,
  `cart_json` longtext NOT NULL,
  `location_type` enum('local','distant') NOT NULL DEFAULT 'local',
  `bill_type` enum('normal','commission','quick') NOT NULL DEFAULT 'normal',
  `party_id` int(11) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `held_bills`
--

LOCK TABLES `held_bills` WRITE;
/*!40000 ALTER TABLE `held_bills` DISABLE KEYS */;
/*!40000 ALTER TABLE `held_bills` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `items`
--

DROP TABLE IF EXISTS `items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name_ta` varchar(100) NOT NULL,
  `name_en` varchar(100) NOT NULL,
  `code` varchar(20) NOT NULL,
  `unit` varchar(20) NOT NULL DEFAULT 'kg',
  `default_rate` decimal(10,2) DEFAULT NULL,
  `is_charge_item` tinyint(1) NOT NULL DEFAULT '0',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=39 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `items`
--

LOCK TABLES `items` WRITE;
/*!40000 ALTER TABLE `items` DISABLE KEYS */;
INSERT INTO `items` VALUES (1,'மிளகாய்','Chilli','MILA','kg',40.00,0,1,'2026-10-17 11:44:50'),(2,'வெண்டை','Ladies Finger','VEN','kg',30.00,0,1,'2026-10-17 11:44:50'),(3,'அவரை','Broad Beans','AVA','kg',35.00,0,1,'2026-10-17 11:44:50'),(4,'புடலை','Snake Gourd','PODA','kg',25.00,0,1,'2026-10-17 11:44:50'),(5,'சுரைக்காய்','Bottle Gourd','SORA','kg',20.00,0,1,'2026-10-17 11:44:50'),(6,'பூசணிக்காய்','Pumpkin','POS','kg',18.00,0,1,'2026-10-17 11:44:50'),(7,'எலுமிச்சை','Lemon','LEM','kg',60.00,0,1,'2026-10-17 11:44:50'),(8,'இஞ்சி','Ginger','IN','kg',80.00,0,1,'2026-10-17 11:44:50'),(9,'நெல்லிக்காய்','Gooseberry','NELL','kg',50.00,0,1,'2026-10-17 11:44:50'),(10,'பீட்ரூட்','Beetroot','BET','kg',30.00,0,1,'2026-10-17 11:44:50'),(11,'கேரட்','Carrot','CAR','kg',40.00,0,1,'2026-10-17 11:44:50'),(12,'கோஸ்','Cabbage','KOSE','kg',20.00,0,1,'2026-10-17 11:44:50'),(13,'கத்தரிக்காய்','Brinjal','KATH','kg',25.00,0,1,'2026-10-17 11:44:50'),(14,'பாகற்காய்','Bitter Gourd','BAAV','kg',30.00,0,1,'2026-10-17 11:44:50'),(15,'பச்ச தக்காளி','Green Tomato (Box)','P.BOX','kg',20.00,0,1,'2026-10-17 11:44:50'),(16,'வெள்ளரிக்காய்','Cucumber','VELL','kg',20.00,0,1,'2026-10-17 11:44:50'),(17,'தடியங்காய்','Ash Gourd','THAD','kg',18.00,0,1,'2026-10-17 11:44:50'),(18,'சுனாமி','Sunaami','SUNA','kg',30.00,0,1,'2026-10-17 11:44:50'),(19,'முருங்கைக்காய்','Drumstick','MUR','kg',45.00,0,1,'2026-10-17 11:44:50'),(20,'சேனை கிழங்கு','Yam','CHEN','kg',35.00,0,1,'2026-10-17 11:44:50'),(21,'சீவல்','Seeval','SEVA','kg',25.00,0,1,'2026-10-17 11:44:50'),(22,'பல்லாரி','Big Onion','PALL','kg',32.00,0,1,'2026-10-17 11:44:50'),(23,'உருளை','Potato','URU','kg',25.00,0,1,'2026-10-17 11:44:50'),(24,'உள்ளி','Small Onion','ULL','kg',45.00,0,1,'2026-10-17 11:44:50'),(25,'சின்னசேம்பு','Small Taro','SAM','kg',40.00,0,1,'2026-10-17 11:44:50'),(26,'பால் சேம்பு','Milk Taro','P.SAM','kg',45.00,0,1,'2026-10-17 11:44:50'),(27,'மாங்காய்','Raw Mango','MAN','kg',30.00,0,1,'2026-10-17 11:44:50'),(28,'தேங்காய்','Coconut','THEN','nos',25.00,0,1,'2026-10-17 11:44:50'),(29,'சீனி கிழங்கு','Sweet Potato','SEE','kg',30.00,0,1,'2026-10-17 11:44:50'),(30,'பூடு','Garlic','PU','kg',120.00,0,1,'2026-10-17 11:44:50'),(31,'பயிறு','Cowpea / Long Beans','PAY','kg',35.00,0,1,'2026-10-17 11:44:50'),(32,'பட்டை அவரை','Flat Beans','P.AVA','kg',40.00,0,1,'2026-10-17 11:44:50'),(33,'பீன்ஸ்','Beans','BEA','kg',45.00,0,1,'2026-10-17 11:44:50'),(34,'தக்காளி (Box)','Tomato (Box)','BOX','kg',25.00,0,1,'2026-10-17 11:44:50'),(35,'வாழைத்தார்','Plantain Bunch','THAR','nos',250.00,0,1,'2026-10-17 11:44:50'),(36,'கறிவேப்பிலை','Curry Leaves','KPVL','kg',60.00,0,1,'2026-10-17 11:44:50'),(37,'மல்லி','Coriander','MALLI','kg',40.00,0,1,'2026-10-17 11:44:50'),(38,'புதினா','Mint','PUTH','kg',30.00,0,1,'2026-10-17 11:44:50');
/*!40000 ALTER TABLE `items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ledger_entries`
--

DROP TABLE IF EXISTS `ledger_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ledger_entries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `party_id` int(11) NOT NULL,
  `entry_date` date NOT NULL,
  `ref_type` enum('bill','purchase','payment','opening','adjustment') NOT NULL,
  `ref_id` int(11) DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ledger_party_date` (`party_id`,`entry_date`),
  CONSTRAINT `ledger_entries_ibfk_1` FOREIGN KEY (`party_id`) REFERENCES `parties` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ledger_entries`
--

LOCK TABLES `ledger_entries` WRITE;
/*!40000 ALTER TABLE `ledger_entries` DISABLE KEYS */;
/*!40000 ALTER TABLE `ledger_entries` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `parties`
--

DROP TABLE IF EXISTS `parties`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `parties` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `place` varchar(150) DEFAULT NULL,
  `type` enum('customer','supplier','both') NOT NULL DEFAULT 'customer',
  `opening_balance` decimal(12,2) NOT NULL DEFAULT '0.00',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `parties`
--

LOCK TABLES `parties` WRITE;
/*!40000 ALTER TABLE `parties` DISABLE KEYS */;
/*!40000 ALTER TABLE `parties` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payment_allocations`
--

DROP TABLE IF EXISTS `payment_allocations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payment_allocations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `payment_id` int(11) NOT NULL,
  `bill_id` int(11) DEFAULT NULL,
  `purchase_id` int(11) DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `payment_id` (`payment_id`),
  KEY `bill_id` (`bill_id`),
  KEY `purchase_id` (`purchase_id`),
  CONSTRAINT `payment_allocations_ibfk_1` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `payment_allocations_ibfk_2` FOREIGN KEY (`bill_id`) REFERENCES `bills` (`id`),
  CONSTRAINT `payment_allocations_ibfk_3` FOREIGN KEY (`purchase_id`) REFERENCES `purchases` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payment_allocations`
--

LOCK TABLES `payment_allocations` WRITE;
/*!40000 ALTER TABLE `payment_allocations` DISABLE KEYS */;
/*!40000 ALTER TABLE `payment_allocations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payment_methods`
--

DROP TABLE IF EXISTS `payment_methods`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payment_methods` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name_ta` varchar(50) NOT NULL,
  `name_en` varchar(50) NOT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int(11) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payment_methods`
--

LOCK TABLES `payment_methods` WRITE;
/*!40000 ALTER TABLE `payment_methods` DISABLE KEYS */;
INSERT INTO `payment_methods` VALUES (1,'கடன்','Credit',1,1,1),(2,'பணம்','Cash',0,1,2),(3,'UPI','UPI',0,1,3),(4,'நெட் பேங்கிங்','Net Banking',0,1,4);
/*!40000 ALTER TABLE `payment_methods` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payments`
--

DROP TABLE IF EXISTS `payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `receipt_no` varchar(20) NOT NULL,
  `direction` enum('in','out') NOT NULL DEFAULT 'in',
  `party_id` int(11) NOT NULL,
  `payment_date` date NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `payment_method_id` int(11) DEFAULT NULL,
  `allocation_mode` enum('auto','manual','on_account') NOT NULL DEFAULT 'on_account',
  `notes` varchar(255) DEFAULT NULL,
  `status` enum('active','cancelled') NOT NULL DEFAULT 'active',
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `receipt_no` (`receipt_no`),
  KEY `party_id` (`party_id`),
  KEY `payment_method_id` (`payment_method_id`),
  CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`party_id`) REFERENCES `parties` (`id`),
  CONSTRAINT `payments_ibfk_2` FOREIGN KEY (`payment_method_id`) REFERENCES `payment_methods` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payments`
--

LOCK TABLES `payments` WRITE;
/*!40000 ALTER TABLE `payments` DISABLE KEYS */;
/*!40000 ALTER TABLE `payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `purchase_lines`
--

DROP TABLE IF EXISTS `purchase_lines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `purchase_lines` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `purchase_id` int(11) NOT NULL,
  `item_id` int(11) DEFAULT NULL,
  `item_name_ta` varchar(100) NOT NULL,
  `item_name_en` varchar(100) NOT NULL,
  `nos` decimal(10,2) NOT NULL DEFAULT '0.00',
  `weight` decimal(10,2) NOT NULL DEFAULT '0.00',
  `rate` decimal(10,2) NOT NULL DEFAULT '0.00',
  `amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `line_order` int(11) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `purchase_id` (`purchase_id`),
  KEY `item_id` (`item_id`),
  CONSTRAINT `purchase_lines_ibfk_1` FOREIGN KEY (`purchase_id`) REFERENCES `purchases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `purchase_lines_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchase_lines`
--

LOCK TABLES `purchase_lines` WRITE;
/*!40000 ALTER TABLE `purchase_lines` DISABLE KEYS */;
/*!40000 ALTER TABLE `purchase_lines` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `purchases`
--

DROP TABLE IF EXISTS `purchases`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `purchases` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `purchase_no` varchar(20) NOT NULL,
  `party_id` int(11) NOT NULL,
  `purchase_date` date NOT NULL,
  `items_total` decimal(12,2) NOT NULL DEFAULT '0.00',
  `discount_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `total` decimal(12,2) NOT NULL DEFAULT '0.00',
  `paid_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `payment_method_id` int(11) DEFAULT NULL,
  `balance_due` decimal(12,2) NOT NULL DEFAULT '0.00',
  `status` enum('active','cancelled') NOT NULL DEFAULT 'active',
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `purchase_no` (`purchase_no`),
  KEY `party_id` (`party_id`),
  KEY `payment_method_id` (`payment_method_id`),
  CONSTRAINT `purchases_ibfk_1` FOREIGN KEY (`party_id`) REFERENCES `parties` (`id`),
  CONSTRAINT `purchases_ibfk_2` FOREIGN KEY (`payment_method_id`) REFERENCES `payment_methods` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchases`
--

LOCK TABLES `purchases` WRITE;
/*!40000 ALTER TABLE `purchases` DISABLE KEYS */;
/*!40000 ALTER TABLE `purchases` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `settings`
--

DROP TABLE IF EXISTS `settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `settings` (
  `key` varchar(100) NOT NULL,
  `value` longtext,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `settings`
--

LOCK TABLES `settings` WRITE;
/*!40000 ALTER TABLE `settings` DISABLE KEYS */;
INSERT INTO `settings` VALUES ('address_line1','தினசரி மார்க்கெட்'),('address_line2','சுரண்டை.'),('company_name_en','Sri Bhavani Vegetables & Fruits Commission Agent'),('company_name_ta','ஸ்ரீ பவானி காய்கனி கமிஷன் வியாபாரம்'),('company_tagline','காய்கனி கமிஷன் வியாபாரம்'),('default_commission_percent','10'),('default_distant_cooli','0'),('default_distant_vadagai','0'),('default_payment_method_id','1'),('default_print_format','a5'),('default_unit','kg'),('email',''),('footer_note','நன்றி! மீண்டும் வருக! • Thank You! Visit Again!'),('god_name_1','ஸ்ரீ பவானி அம்மன் துணை'),('god_name_2','ஸ்ரீ பொட்டல் மாடசாமி'),('gstin',''),('gstin_visible','false'),('invoice_language','ta'),('logo_brand','VTC'),('logo_url',''),('phone_numbers','[\"9659580845\", \"9488103983\", \"9789767576\"]'),('proprietor_name','பவானி சங்கர்'),('rounding_rule','none'),('shop_number','14'),('shop_number_2','15'),('show_logo','true'),('show_previous_balance','true'),('ui_language','ta');
/*!40000 ALTER TABLE `settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `username` varchar(50) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `pin_hash` varchar(255) DEFAULT NULL,
  `role` enum('admin','manager','staff') NOT NULL DEFAULT 'staff',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Admin','admin','$2y$10$6x4ggV7/XCtwaax5qeD0je7A1S.TLoSNmGzFQFbGujdJwCPMzt1U6',NULL,'admin',1,'2026-10-17 11:44:50');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-17 13:16:46
