import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { actorOf, requireAuth, userOf } from '../auth/session.js';
import { assertCustomerAccess, caseScope, customerScope } from '../auth/access.js';
import { CUSTOMER_STATUSES } from '../domain/enums.js';
import { audit } from '../lib/audit.js';
import { badRequest } from '../lib/http.js';
import { parseJson } from '../lib/json.js';
import { parseBody, trimmed } from '../lib/validate.js';
import { issueCustomerToken } from '../modules/tokens.js';

export const customersRouter = Router();
customersRouter.use('/customers', requireAuth);

const CustomerBody = z.object({
  name: trimmed(2, 200),
  industry: z.string().trim().max(200).nullish(),
  contactName: z.string().trim().max(200).nullish(),
  contactEmail: z.union([z.string().trim().email(), z.literal('')]).nullish(),
  phone: z.string().trim().max(50).nullish(),
  status: z.enum(CUSTOMER_STATUSES).default('PROSPECT'),
  notes: z.string().max(5000).nullish(),
});

customersRouter.get('/customers', async (req, res) => {
  const user = userOf(req);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
  const customers = await prisma.customer.findMany({
    where: {
      AND: [
        customerScope(user),
        status ? { status } : {},
        q
          ? {
              OR: [
                { name: { contains: q } },
                { contactName: { contains: q } },
                { contactEmail: { contains: q } },
                { industry: { contains: q } },
                { cases: { some: { title: { contains: q } } } },
              ],
            }
          : {},
      ],
    },
    include: { cases: { where: caseScope(user), select: { id: true, status: true, salesOutcome: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({
    customers: customers.map(({ cases, ...c }) => ({
      ...c,
      caseCount: cases.length,
      openCaseCount: cases.filter((k) => k.status !== 'CLOSED').length,
    })),
  });
});

customersRouter.post('/customers', async (req, res) => {
  const body = parseBody(CustomerBody, req.body);
  const customer = await prisma.customer.create({ data: { ...body, contactEmail: body.contactEmail || null } });
  await audit(actorOf(req), 'CUSTOMER_CREATED', { customerId: customer.id, details: { name: customer.name } });
  res.status(201).json({ customer });
});

customersRouter.get('/customers/:id', async (req, res) => {
  const user = userOf(req);
  const customer = await assertCustomerAccess(user, req.params.id as string);
  const [cases, exitConversations, consents] = await Promise.all([
    prisma.customerCase.findMany({
      where: { customerId: customer.id, ...caseScope(user) },
      include: { owner: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.exitConversation.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: 'desc' } }),
    prisma.contactConsent.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: 'desc' } }),
  ]);
  // Agents only see cases they can access; hide the count of other cases.
  res.json({
    customer,
    cases,
    exitConversations: exitConversations.map((e) => ({
      ...e,
      messages: parseJson(e.messages, []),
      statedReasons: parseJson(e.statedReasons, []),
      summary: parseJson(e.summary, null),
    })),
    consents,
  });
});

customersRouter.patch('/customers/:id', async (req, res) => {
  const user = userOf(req);
  await assertCustomerAccess(user, req.params.id as string);
  const body = parseBody(CustomerBody.partial(), req.body);
  const customer = await prisma.customer.update({
    where: { id: req.params.id },
    data: { ...body, contactEmail: body.contactEmail === '' ? null : body.contactEmail },
  });
  await audit(actorOf(req), 'CUSTOMER_UPDATED', { customerId: customer.id, details: { fields: Object.keys(body) } });
  res.json({ customer });
});

/** Creates a link for the voluntary exit conversation. The link is shown to staff; nothing is sent automatically. */
customersRouter.post('/customers/:id/exit-link', async (req, res) => {
  const user = userOf(req);
  const customer = await assertCustomerAccess(user, req.params.id as string);
  const body = parseBody(z.object({ caseId: z.string().optional() }), req.body ?? {});
  const kase = await prisma.customerCase.findFirst({
    where: { customerId: customer.id, ...caseScope(user), ...(body.caseId ? { id: body.caseId } : {}) },
    orderBy: { createdAt: 'desc' },
  });
  if (!kase) throw badRequest('Customer has no case to attach the exit conversation to');
  const link = await issueCustomerToken(kase.id, 'EXIT', user.id);
  await audit(actorOf(req), 'EXIT_LINK_CREATED', { customerId: customer.id, caseId: kase.id, details: { expiresAt: link.expiresAt } });
  res.status(201).json({ url: link.url, expiresAt: link.expiresAt });
});
