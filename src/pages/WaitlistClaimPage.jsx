import { useEffect, useRef, useState } from 'react';
import { BellRing } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  acceptPublicWaitlistOffer,
  adaptPublicBooking,
  loadPublicBookingCatalog,
} from '../lib/api';
import { dateInTimezone } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { readFragmentCapability } from '../lib/capabilityTokens';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import PageContainer from '../components/PageContainer/PageContainer';
import './WaitlistClaimPage.css';

const WaitlistClaimPage = () => {
  const { businessSlug } = useParams();
  const { hash, pathname, search } = useLocation();
  const navigate = useNavigate();
  const [offerToken] = useState(() => readFragmentCapability(hash, 'wo'));
  const [error, setError] = useState(
    offerToken ? null : 'קישור ההמתנה חסר או אינו תקין.'
  );
  const [isAccepting, setIsAccepting] = useState(false);
  const claimRequestRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!hash) return;
    window.history.replaceState(window.history.state, '', `${pathname}${search}`);
  }, [hash, pathname, search]);

  const handleAccept = () => {
    if (!offerToken || claimRequestRef.current) return;
    setIsAccepting(true);
    setError(null);
    claimRequestRef.current = loadPublicBookingCatalog(businessSlug).then(
      async (catalog) => [
        catalog,
        await acceptPublicWaitlistOffer(businessSlug, offerToken),
      ]
    );
    claimRequestRef.current
      .then(([catalog, accepted]) => {
        if (!mountedRef.current) return;
        const timezone = catalog.location.timezone;
        const visitDate = dateInTimezone(accepted.startsAt, timezone);
        const booking = adaptPublicBooking(accepted, visitDate);
        const serviceNamesById = new Map(
          catalog.services.map((service) => [service.id, service.name])
        );
        navigate(`/book/${businessSlug}/success`, {
          replace: true,
          state: {
            booking,
            serviceNames: accepted.steps
              .map((step) => serviceNamesById.get(step.serviceId))
              .filter(Boolean),
            bookingPath: `/book/${businessSlug}`,
            timezone,
          },
        });
      })
      .catch((claimError) => {
        if (!mountedRef.current) return;
        claimRequestRef.current = null;
        setIsAccepting(false);
        setError(
          friendlyError(
            claimError,
            'לא הצלחנו לאשר את הזמן שהתפנה. יש לחזור לקישור שקיבלת או לקבוע תור חדש.'
          )
        );
      });
  };

  return (
    <PageContainer size="sm" className="waitlist-claim-page">
      <div className="waitlist-claim-card">
        <BellRing size={52} className="waitlist-claim-icon" aria-hidden="true" />
        <h1>אישור הזמן שהתפנה</h1>
        {error ? (
          <>
            <p className="error-state" role="alert">{error}</p>
            <Link className="btn-primary" to={`/book/${businessSlug}`}>
              חזרה להזמנת תור
            </Link>
          </>
        ) : isAccepting ? (
          <LoadingSpinner text="שומרים את הזמן ומאשרים את התור..." />
        ) : (
          <>
            <p>
              הזמן נשמר עבורך לזמן קצר. יש לאשר כדי להפוך אותו לתור קבוע.
            </p>
            <button type="button" className="btn-primary" onClick={handleAccept}>
              אישור וקביעת התור
            </button>
          </>
        )}
      </div>
    </PageContainer>
  );
};

export default WaitlistClaimPage;
